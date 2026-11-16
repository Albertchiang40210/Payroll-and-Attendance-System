// 測試會連續登記許多次，調高登記限流（正式環境維持每 15 分鐘 10 次）
process.env.PAIR_RATE_LIMIT_MAX = '1000';

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let adminToken;
let wang;   // 王小明
let lee;    // 李小華
let admin;
let wangPhone;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const asAdmin = (req) => req.set(auth(adminToken));
const createQr = (userId, body = {}) => asAdmin(request(app).post('/api/kiosk/qr')).send({ userId, ...body });
const pair = (code) => request(app).post('/api/kiosk/pair').send({ code });
const phoneGet = (token, path) => request(app).get(path).set(auth(token));
const phoneClock = (token, body) => request(app).post('/api/kiosk/clock').set(auth(token)).send(body);

// 為某位員工產生 QR Code 並登記一支新手機，回傳該手機的 token
async function registerPhone(userId) {
    const qr = await createQr(userId);
    const res = await pair(qr.body.code);
    return res.body.token;
}

async function cleanup() {
    await prisma.attendance.deleteMany();
    await prisma.pairingCode.deleteMany();
    await prisma.setting.deleteMany();
    await prisma.user.deleteMany();
}

beforeAll(async () => {
    await cleanup();
    const hashed = await bcrypt.hash('adminpass1', 10);
    admin = await prisma.user.create({
        data: { username: 'boss', password: hashed, name: 'Boss', role: 'ADMIN', hourly_rate: 0, punch: false }
    });
    wang = await prisma.user.create({
        data: { username: 'emp_a', password: hashed, name: '王小明', role: 'EMPLOYEE', hourly_rate: 190 }
    });
    lee = await prisma.user.create({
        data: { username: 'emp_b', password: hashed, name: '李小華', role: 'EMPLOYEE', hourly_rate: 190 }
    });
    const login = await request(app).post('/api/auth/login').send({ username: 'boss', password: 'adminpass1' });
    adminToken = login.body.token;
});

afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
});

describe('Creating a registration QR code', () => {
    it('refuses to pair when no QR code has been generated', async () => {
        expect((await pair('ANYTHING')).statusCode).toEqual(401);
    });

    it('only admins can generate one', async () => {
        const res = await request(app).post('/api/kiosk/qr').send({ userId: wang.id });
        expect(res.statusCode).toEqual(401);
    });

    it('requires choosing an employee', async () => {
        const res = await asAdmin(request(app).post('/api/kiosk/qr')).send({});
        expect(res.statusCode).toEqual(400);
    });

    it('refuses an unknown employee, an admin account and a deactivated employee', async () => {
        expect((await createQr(999999)).statusCode).toEqual(404);
        expect((await createQr(admin.id)).statusCode).toEqual(404);

        const gone = await prisma.user.create({
            data: { username: 'gone', password: 'x', name: '已離職', role: 'EMPLOYEE', hourly_rate: 1, active: false }
        });
        expect((await createQr(gone.id)).statusCode).toEqual(404);
    });

    it('generates a short-lived, single-use code for one employee', async () => {
        const res = await createQr(wang.id);
        expect(res.statusCode).toEqual(200);
        expect(res.body.employee).toEqual({ id: wang.id, name: '王小明' });
        expect(res.body.max_uses).toBe(1);
        expect(res.body.uses).toBe(0);
        expect(res.body.qr_data_url).toMatch(/^data:image\/svg\+xml;base64,/);
        expect(res.body.url).toMatch(/\/#c=[A-Z2-9]{10}$/);
        const minutesLeft = (new Date(res.body.expires_at) - Date.now()) / 60000;
        expect(minutesLeft).toBeGreaterThan(9);
        expect(minutesLeft).toBeLessThanOrEqual(10);
    });
});

describe('Registering a phone', () => {
    it('rejects a wrong code', async () => {
        expect((await pair('WRONGCODE1')).statusCode).toEqual(401);
    });

    it('binds the phone to the employee the code was made for', async () => {
        const qr = await createQr(wang.id);
        const res = await pair(qr.body.code.toLowerCase());
        expect(res.statusCode).toEqual(200);
        expect(res.body.name).toBe('王小明');
        wangPhone = res.body.token;

        const me = await phoneGet(wangPhone, '/api/kiosk/me');
        expect(me.body).toMatchObject({ id: wang.id, name: '王小明', location_required: false });
    });

    it('cannot be used a second time (a photo of the QR code is useless)', async () => {
        const qr = await createQr(lee.id);
        expect((await pair(qr.body.code)).statusCode).toEqual(200);
        expect((await pair(qr.body.code)).statusCode).toEqual(401);
    });

    it('lets exactly one phone in when several scan at the same time', async () => {
        const qr = await createQr(lee.id);
        const results = await Promise.all(Array.from({ length: 6 }, () => pair(qr.body.code)));
        expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
        expect(results.filter((r) => r.statusCode === 401)).toHaveLength(5);
    });

    it('stops working after it expires', async () => {
        const qr = await createQr(lee.id);
        await prisma.pairingCode.update({ where: { code: qr.body.code }, data: { expiresAt: new Date(Date.now() - 1000) } });
        expect((await pair(qr.body.code)).statusCode).toEqual(401);

        const status = await asAdmin(request(app).get('/api/kiosk/qr'));
        expect(status.body.set).toBe(false);
    });

    it('voids the previous code when a new one is generated', async () => {
        const first = await createQr(wang.id);
        const second = await createQr(lee.id);
        expect((await pair(first.body.code)).statusCode).toEqual(401);
        expect((await pair(second.body.code)).statusCode).toEqual(200);
    });
});

describe('A phone can only punch for its own employee', () => {
    it('blocks requests without a registered phone', async () => {
        expect((await request(app).get('/api/kiosk/me')).statusCode).toEqual(401);
        expect((await request(app).post('/api/kiosk/clock').send({ type: 'in' })).statusCode).toEqual(401);
    });

    it('blocks a normal login token from the phone endpoints', async () => {
        expect((await phoneGet(adminToken, '/api/kiosk/me')).statusCode).toEqual(401);
    });

    it('does not let a phone use admin APIs', async () => {
        for (const path of ['/api/employees', '/api/salary?month=2026-11', '/api/attendance/today', '/api/kiosk/devices']) {
            expect((await phoneGet(wangPhone, path)).statusCode).toEqual(401);
        }
    });

    it('no longer offers a list of employees to pick from', async () => {
        expect((await phoneGet(wangPhone, '/api/kiosk/employees')).statusCode).toEqual(404);
    });

    it('blocks overtime before the normal shift is finished', async () => {
        const res = await phoneClock(wangPhone, { type: 'in', punch_type: '加班' });
        expect(res.statusCode).toEqual(400);
    });

    it('punches in and out', async () => {
        const inRes = await phoneClock(wangPhone, { type: 'in' });
        expect(inRes.statusCode).toEqual(200);
        expect(inRes.body.message).toContain('王小明');

        expect((await phoneClock(wangPhone, { type: 'in' })).statusCode).toEqual(400);
        expect((await phoneClock(wangPhone, { type: 'out' })).statusCode).toEqual(200);
    });

    it('ignores any attempt to name another employee', async () => {
        // 即使在請求裡指定李小華，打卡仍然記在手機的主人（王小明）身上
        const res = await phoneClock(wangPhone, { type: 'in', punch_type: '加班', userId: lee.id });
        expect(res.statusCode).toEqual(200);

        expect(await prisma.attendance.count({ where: { userId: lee.id } })).toBe(0);
        expect(await prisma.attendance.count({ where: { userId: wang.id } })).toBe(2);
    });

    it('only shows the owner their own records', async () => {
        const res = await phoneGet(wangPhone, '/api/kiosk/records');
        expect(res.statusCode).toEqual(200);
        expect(res.body.name).toBe('王小明');
        expect(res.body.today).toHaveLength(2);
        expect(res.body.month).toBeDefined();
    });
});

describe('Changing, unbinding and revoking phones', () => {
    it('shows which employees have a registered phone', async () => {
        const res = await asAdmin(request(app).get('/api/kiosk/devices'));
        expect(res.statusCode).toEqual(200);
        const byName = Object.fromEntries(res.body.map((u) => [u.name, u.bound]));
        expect(byName['王小明']).toBe(true);
    });

    it('replaces the old phone when the employee registers a new one', async () => {
        const newPhone = await registerPhone(wang.id);
        expect((await phoneGet(newPhone, '/api/kiosk/me')).statusCode).toEqual(200);
        expect((await phoneGet(wangPhone, '/api/kiosk/me')).statusCode).toEqual(401);
        wangPhone = newPhone;
    });

    it('does not log out other phones when a new code is generated', async () => {
        await createQr(lee.id);
        expect((await phoneGet(wangPhone, '/api/kiosk/me')).statusCode).toEqual(200);
    });

    it('lets the admin unbind one employee phone', async () => {
        const res = await asAdmin(request(app).delete(`/api/kiosk/devices/${wang.id}`));
        expect(res.statusCode).toEqual(200);
        expect((await phoneGet(wangPhone, '/api/kiosk/me')).statusCode).toEqual(401);
    });

    it('stops a phone from working once its employee is deactivated', async () => {
        wangPhone = await registerPhone(wang.id);
        await asAdmin(request(app).put(`/api/employees/${wang.id}`)).send({ active: false });
        expect((await phoneGet(wangPhone, '/api/kiosk/me')).statusCode).toEqual(401);
        await asAdmin(request(app).put(`/api/employees/${wang.id}`)).send({ active: true });
    });

    it('revokes every phone at once', async () => {
        const phoneA = await registerPhone(wang.id);
        const phoneB = await registerPhone(lee.id);
        const res = await asAdmin(request(app).post('/api/kiosk/revoke-all'));
        expect(res.statusCode).toEqual(200);
        expect((await phoneGet(phoneA, '/api/kiosk/me')).statusCode).toEqual(401);
        expect((await phoneGet(phoneB, '/api/kiosk/me')).statusCode).toEqual(401);
    });

    it('only admins can unbind or revoke', async () => {
        expect((await request(app).delete(`/api/kiosk/devices/${wang.id}`)).statusCode).toEqual(401);
        expect((await request(app).post('/api/kiosk/revoke-all')).statusCode).toEqual(401);
    });
});

describe('Punching only at the store', () => {
    const STORE = { lat: 25.1, lng: 121.5 };
    let phone;

    const setStore = (body) => asAdmin(request(app).put('/api/kiosk/location')).send(body);
    const here = (extra = {}) => ({ lat: STORE.lat + 0.0003, lng: STORE.lng, accuracy: 20, ...extra }); // 約 33 公尺
    const faraway = { lat: STORE.lat + 0.01, lng: STORE.lng, accuracy: 20 };                          // 約 1.1 公里

    beforeAll(async () => {
        phone = await registerPhone(lee.id);
    });

    it('does not ask for a location until the store location is set', async () => {
        const me = await phoneGet(phone, '/api/kiosk/me');
        expect(me.body.location_required).toBe(false);
        // 尚未設定位置時，不帶位置也能打卡
        expect((await phoneClock(phone, { type: 'in' })).statusCode).toEqual(200);
    });

    it('only admins can set the store location', async () => {
        const res = await request(app).put('/api/kiosk/location').send({ ...STORE, radius: 150 });
        expect(res.statusCode).toEqual(401);
        expect((await phoneGet(phone, '/api/kiosk/location')).statusCode).toEqual(401);
    });

    it('validates the store location', async () => {
        expect((await setStore({ lat: 120, lng: 121.5, radius: 150 })).statusCode).toEqual(400);
        expect((await setStore({ ...STORE, radius: 10 })).statusCode).toEqual(400);
        expect((await setStore({ ...STORE, radius: 5000 })).statusCode).toEqual(400);
    });

    it('saves the store location', async () => {
        const res = await setStore({ ...STORE, radius: 150 });
        expect(res.statusCode).toEqual(200);
        const got = await asAdmin(request(app).get('/api/kiosk/location'));
        expect(got.body).toEqual({ set: true, ...STORE, radius: 150 });

        const me = await phoneGet(phone, '/api/kiosk/me');
        expect(me.body.location_required).toBe(true);
    });

    it('refuses to punch without a location', async () => {
        const res = await phoneClock(phone, { type: 'out' });
        expect(res.statusCode).toEqual(400);
        expect(res.body.message).toContain('位置');
    });

    it('refuses to punch from far away (someone who is not at the store)', async () => {
        const res = await phoneClock(phone, { type: 'out', location: faraway });
        expect(res.statusCode).toEqual(403);
        expect(res.body.message).toContain('不在店裡');
    });

    it('refuses a location that is too inaccurate to trust', async () => {
        const res = await phoneClock(phone, { type: 'out', location: here({ accuracy: 800 }) });
        expect(res.statusCode).toEqual(400);
    });

    it('refuses a malformed location', async () => {
        const res = await phoneClock(phone, { type: 'out', location: { lat: 'x', lng: 1 } });
        expect(res.statusCode).toEqual(400);
    });

    it('did not record anything from the blocked attempts', async () => {
        const rec = await prisma.attendance.findFirst({ where: { userId: lee.id } });
        expect(rec.clock_out).toBeNull();
    });

    it('allows punching near the store and records how far away it was', async () => {
        const res = await phoneClock(phone, { type: 'out', location: here() });
        expect(res.statusCode).toEqual(200);

        const rec = await prisma.attendance.findFirst({ where: { userId: lee.id } });
        expect(rec.out_distance).toBeGreaterThan(20);
        expect(rec.out_distance).toBeLessThan(50);
        expect(rec.in_distance).toBeNull(); // 上班打卡時尚未設定位置
    });

    it('lets the admin switch the restriction off again', async () => {
        const res = await asAdmin(request(app).delete('/api/kiosk/location'));
        expect(res.statusCode).toEqual(200);
        const me = await phoneGet(phone, '/api/kiosk/me');
        expect(me.body.location_required).toBe(false);
    });
});

describe('Admins who also punch', () => {
    let boss2;

    beforeAll(async () => {
        const hashed = await bcrypt.hash('adminpass1', 10);
        boss2 = await prisma.user.create({
            data: { username: 'boss2', password: hashed, name: '老闆本人', role: 'ADMIN', hourly_rate: 200, punch: true }
        });
    });

    it('lets an admin who is marked as punching register a phone and punch', async () => {
        const phone = await registerPhone(boss2.id);
        expect(phone).toBeTruthy();
        const res = await phoneClock(phone, { type: 'in' });
        expect(res.statusCode).toEqual(200);
        expect(res.body.message).toContain('老闆本人');
    });

    it('still refuses an admin account that is not marked as punching', async () => {
        expect((await createQr(admin.id)).statusCode).toEqual(404);
    });

    it('stops that admin from punching once the setting is switched off', async () => {
        const phone = await registerPhone(boss2.id);
        await asAdmin(request(app).put(`/api/employees/${boss2.id}`)).send({ punch: false });
        expect((await phoneGet(phone, '/api/kiosk/me')).statusCode).toEqual(401);
        expect((await createQr(boss2.id)).statusCode).toEqual(404);
        await asAdmin(request(app).put(`/api/employees/${boss2.id}`)).send({ punch: true });
    });

    it('lists the admin among the people who need a phone only when punching is on', async () => {
        const res = await asAdmin(request(app).get('/api/kiosk/devices'));
        expect(res.body.map((u) => u.name)).toContain('老闆本人');
        expect(res.body.map((u) => u.name)).not.toContain('Boss');
    });

    it('creates employees as punching and admins as not punching by default', async () => {
        const emp = await asAdmin(request(app).post('/api/employees')).send({ name: '新員工甲', hourly_rate: 190 });
        expect(emp.body.data.punch).toBe(true);

        const adm = await asAdmin(request(app).post('/api/employees')).send({
            name: '新管理員', hourly_rate: 0, role: 'ADMIN', username: 'newadmin', password: 'secret12'
        });
        expect(adm.body.data.punch).toBe(false);

        const adm2 = await asAdmin(request(app).post('/api/employees')).send({
            name: '會打卡的管理員', hourly_rate: 0, role: 'ADMIN', username: 'newadmin2', password: 'secret12', punch: true
        });
        expect(adm2.body.data.punch).toBe(true);
    });
});

describe('Deleting employees', () => {
    const del = (id) => asAdmin(request(app).delete(`/api/employees/${id}`));
    let victim;

    beforeAll(async () => {
        victim = await prisma.user.create({
            data: { username: 'victim', password: 'x', name: '要刪除的人', role: 'EMPLOYEE', hourly_rate: 100 }
        });
        await prisma.attendance.create({
            data: { userId: victim.id, work_date: '2026-11-10', clock_in: new Date(), clock_out: new Date() }
        });
    });

    it('reports how many punch records an employee has, so the UI can warn first', async () => {
        const res = await asAdmin(request(app).get('/api/employees'));
        expect(res.body.find((u) => u.id === victim.id).attendance_count).toBe(1);
    });

    it('requires an admin', async () => {
        expect((await request(app).delete(`/api/employees/${victim.id}`)).statusCode).toEqual(401);
    });

    it('refuses to delete the account you are logged in with', async () => {
        const res = await del(admin.id);
        expect(res.statusCode).toEqual(400);
    });

    it('deletes the employee together with their punch records and registered phone', async () => {
        const phone = await registerPhone(victim.id);
        expect((await phoneGet(phone, '/api/kiosk/me')).statusCode).toEqual(200);

        const res = await del(victim.id);
        expect(res.statusCode).toEqual(200);
        expect(await prisma.attendance.count({ where: { userId: victim.id } })).toBe(0);
        expect(await prisma.device.count({ where: { userId: victim.id } })).toBe(0);
        expect((await phoneGet(phone, '/api/kiosk/me')).statusCode).toEqual(401);
    });

    it('returns 404 for someone who no longer exists', async () => {
        expect((await del(victim.id)).statusCode).toEqual(404);
    });

    it('can delete another admin account', async () => {
        const other = await prisma.user.create({
            data: { username: 'otheradmin', password: 'x', name: '另一位管理員', role: 'ADMIN', hourly_rate: 0 }
        });
        expect((await del(other.id)).statusCode).toEqual(200);
    });
});

describe('Employee creation without credentials', () => {
    it('creates an employee with only a name and hourly rate', async () => {
        const res = await asAdmin(request(app).post('/api/employees')).send({ name: '張小美', hourly_rate: 200 });
        expect(res.statusCode).toEqual(200);
        expect(res.body.data.role).toBe('EMPLOYEE');
        expect(res.body.data.username).toMatch(/^emp_/);
    });

    it('still requires credentials for an admin', async () => {
        const res = await asAdmin(request(app).post('/api/employees')).send({ name: '新老闆', hourly_rate: 0, role: 'ADMIN' });
        expect(res.statusCode).toEqual(400);
    });
});
