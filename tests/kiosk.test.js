const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let adminToken;
let employee;
let kioskToken;
let code;

const kioskGet = (path) => request(app).get(path).set('Authorization', `Bearer ${kioskToken}`);
const kioskClock = (body) =>
    request(app).post('/api/kiosk/clock').set('Authorization', `Bearer ${kioskToken}`).send(body);

async function cleanup() {
    await prisma.attendance.deleteMany();
    await prisma.setting.deleteMany();
    await prisma.user.deleteMany();
}

beforeAll(async () => {
    await cleanup();

    const hashed = await bcrypt.hash('adminpass1', 10);
    await prisma.user.create({
        data: { username: 'boss', password: hashed, name: 'Boss', role: 'ADMIN', hourly_rate: 0 }
    });
    employee = await prisma.user.create({
        data: { username: 'emp_x', password: hashed, name: '王小明', role: 'EMPLOYEE', hourly_rate: 190 }
    });

    const login = await request(app).post('/api/auth/login').send({ username: 'boss', password: 'adminpass1' });
    adminToken = login.body.token;
});

afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
});

describe('Kiosk pairing', () => {
    it('refuses to pair before a QR code has been generated', async () => {
        const res = await request(app).post('/api/kiosk/pair').send({ code: 'ANYTHING' });
        expect(res.statusCode).toEqual(403);
    });

    it('only admins can generate the QR code', async () => {
        const res = await request(app).post('/api/kiosk/qr/regenerate');
        expect(res.statusCode).toEqual(401);
    });

    it('generates a QR code for admins', async () => {
        const res = await request(app).post('/api/kiosk/qr/regenerate').set('Authorization', `Bearer ${adminToken}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body.set).toBe(true);
        expect(res.body.qr_data_url).toMatch(/^data:image\/svg\+xml;base64,/);
        expect(res.body.url).toMatch(/\/#c=[A-Z2-9]{10}$/);
        code = res.body.code;
    });

    it('rejects a wrong code', async () => {
        const res = await request(app).post('/api/kiosk/pair').send({ code: 'WRONGCODE1' });
        expect(res.statusCode).toEqual(401);
    });

    it('pairs a phone with the right code (case-insensitive)', async () => {
        const res = await request(app).post('/api/kiosk/pair').send({ code: code.toLowerCase() });
        expect(res.statusCode).toEqual(200);
        expect(res.body.token).toBeTruthy();
        kioskToken = res.body.token;
    });
});

describe('Kiosk access control', () => {
    it('blocks the employee list without a device token', async () => {
        const res = await request(app).get('/api/kiosk/employees');
        expect(res.statusCode).toEqual(401);
    });

    it('blocks a normal login token from the kiosk endpoints', async () => {
        const res = await request(app).get('/api/kiosk/employees').set('Authorization', `Bearer ${adminToken}`);
        expect(res.statusCode).toEqual(401);
    });

    it('does not let a device token use admin APIs', async () => {
        for (const path of ['/api/employees', '/api/salary?month=2026-11', '/api/attendance/today']) {
            const res = await request(app).get(path).set('Authorization', `Bearer ${kioskToken}`);
            expect(res.statusCode).toEqual(401);
        }
    });

    it('lists only active employees, without any wage information', async () => {
        const res = await kioskGet('/api/kiosk/employees');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toEqual([{ id: employee.id, name: '王小明' }]);
    });
});

describe('Kiosk punching', () => {
    it('shows an empty record before punching', async () => {
        const res = await kioskGet(`/api/kiosk/records?userId=${employee.id}`);
        expect(res.statusCode).toEqual(200);
        expect(res.body.today).toEqual([]);
    });

    it('blocks overtime before the normal shift is finished', async () => {
        const res = await kioskClock({ userId: employee.id, type: 'in', punch_type: '加班' });
        expect(res.statusCode).toEqual(400);
    });

    it('punches in and out by choosing a name', async () => {
        const inRes = await kioskClock({ userId: employee.id, type: 'in' });
        expect(inRes.statusCode).toEqual(200);
        expect(inRes.body.message).toContain('王小明');

        const dup = await kioskClock({ userId: employee.id, type: 'in' });
        expect(dup.statusCode).toEqual(400);

        const outRes = await kioskClock({ userId: employee.id, type: 'out' });
        expect(outRes.statusCode).toEqual(200);
    });

    it('shows the punch records afterwards', async () => {
        const res = await kioskGet(`/api/kiosk/records?userId=${employee.id}`);
        expect(res.body.today).toHaveLength(1);
        expect(res.body.today[0].log_out).not.toBeNull();
        expect(res.body.recent).toHaveLength(1);
    });

    it('allows overtime once the normal shift is finished', async () => {
        const inRes = await kioskClock({ userId: employee.id, type: 'in', punch_type: '加班' });
        expect(inRes.statusCode).toEqual(200);
        const outRes = await kioskClock({ userId: employee.id, type: 'out', punch_type: '加班' });
        expect(outRes.statusCode).toEqual(200);
    });

    it('cannot punch for an admin account', async () => {
        const admin = await prisma.user.findUnique({ where: { username: 'boss' } });
        const res = await kioskClock({ userId: admin.id, type: 'in' });
        expect(res.statusCode).toEqual(404);
    });
});

describe('Deactivated employees and QR rotation', () => {
    it('hides a deactivated employee and refuses to punch for them', async () => {
        await request(app)
            .put(`/api/employees/${employee.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ active: false });

        const list = await kioskGet('/api/kiosk/employees');
        expect(list.body).toEqual([]);

        const res = await kioskClock({ userId: employee.id, type: 'in' });
        expect(res.statusCode).toEqual(404);
    });

    it('invalidates every paired phone when the QR code is regenerated', async () => {
        const regen = await request(app).post('/api/kiosk/qr/regenerate').set('Authorization', `Bearer ${adminToken}`);
        expect(regen.body.code).not.toEqual(code);

        const res = await kioskGet('/api/kiosk/employees');
        expect(res.statusCode).toEqual(401);
    });
});

describe('Employee creation without credentials', () => {
    it('creates an employee with only a name and hourly rate', async () => {
        const res = await request(app)
            .post('/api/employees')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: '李小華', hourly_rate: 200 });
        expect(res.statusCode).toEqual(200);
        expect(res.body.data.role).toBe('EMPLOYEE');
        expect(res.body.data.username).toMatch(/^emp_/);
    });

    it('still requires credentials for an admin', async () => {
        const res = await request(app)
            .post('/api/employees')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: '新老闆', hourly_rate: 0, role: 'ADMIN' });
        expect(res.statusCode).toEqual(400);
    });
});
