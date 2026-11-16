const request = require('supertest');
const bcrypt = require('bcrypt');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const app = require('../src/app');
const prisma = require('../src/utils/prisma');

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Taipei';
// 固定使用過去的月份，結果不隨執行日期改變
const at = (date, time) => dayjs.tz(`${date} ${time}`, TZ).toDate();

let adminToken;
let alice;  // 時薪 190
let bob;    // 時薪 0
const get = (month) => request(app).get(`/api/salary?month=${month}`).set('Authorization', `Bearer ${adminToken}`);

async function shift(userId, date, inTime, outTime, punch_type = '正常', extra = {}) {
    return prisma.attendance.create({
        data: {
            userId, work_date: date, punch_type,
            clock_in: at(date, inTime),
            clock_out: outTime ? at(date, outTime) : null,
            ...extra
        }
    });
}

async function cleanup() {
    await prisma.attendance.deleteMany();
    await prisma.pairingCode.deleteMany();
    await prisma.setting.deleteMany();
    await prisma.user.deleteMany();
}

beforeAll(async () => {
    await cleanup();
    const hashed = await bcrypt.hash('password123', 10);
    await prisma.user.create({
        data: { username: 'boss', password: hashed, name: 'Boss', role: 'ADMIN', hourly_rate: 0, punch: false }
    });
    alice = await prisma.user.create({
        data: { username: 'alice', password: hashed, name: '愛麗絲', role: 'EMPLOYEE', hourly_rate: 190 }
    });
    bob = await prisma.user.create({
        data: { username: 'bob', password: hashed, name: '鮑伯', role: 'EMPLOYEE', hourly_rate: 0 }
    });
    adminToken = (await request(app).post('/api/auth/login').send({ username: 'boss', password: 'password123' })).body.token;

    // 愛麗絲 2026-03：
    await shift(alice.id, '2026-03-02', '09:00', '17:30');                       // 8.5 小時 → 1615
    await shift(alice.id, '2026-03-03', '09:00', '12:20');                       // 3 小時 20 分 → 633.33 → 633
    await shift(alice.id, '2026-03-03', '15:00', '17:00', '加班');                 // 加班 2 小時，不加成 → 380
    await shift(alice.id, '2026-03-04', '09:00', null);                          // 還沒下班：不計
    await shift(alice.id, '2026-02-28', '09:00', '17:00');                       // 上個月：不計
    await shift(alice.id, '2026-04-01', '09:00', '17:00');                       // 下個月：不計
    await shift(alice.id, '2026-03-05', '10:00', '12:00', '正常', { manual: true }); // 補登 2 小時 → 380
    // 鮑伯：時薪 0
    await shift(bob.id, '2026-03-02', '09:00', '13:00');
});

afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
});

describe('Salary report', () => {
    it('requires an admin', async () => {
        expect((await request(app).get('/api/salary?month=2026-03')).statusCode).toEqual(401);
    });

    it('rejects a malformed month', async () => {
        expect((await get('2026-3')).statusCode).toEqual(400);
        expect((await get('2026-13')).statusCode).toEqual(400);
        expect((await request(app).get('/api/salary').set('Authorization', `Bearer ${adminToken}`)).statusCode).toEqual(400);
    });

    it('pays hours × hourly rate, rounding each day to whole dollars', async () => {
        const res = await get('2026-03');
        const row = res.body.summary.find((s) => s.name === '愛麗絲');
        // 1615 + 633 + 380 + 380 = 3008
        expect(row.total_salary).toBe(3008);
        expect(row.hourly_rate).toBe(190);
    });

    it('sums hours with two decimals', async () => {
        const row = (await get('2026-03')).body.summary.find((s) => s.name === '愛麗絲');
        // 8.5 + 3.3333 + 2 + 2 = 15.8333
        expect(row.total_hours).toBe('15.83');
    });

    it('pays overtime at the normal rate (no premium)', async () => {
        const detail = (await get('2026-03')).body.details.find((d) => d.punch_type === '加班');
        expect(detail.day_hours).toBe('2.00');
        expect(detail.earned).toBe(380);
    });

    it('ignores unfinished shifts and other months', async () => {
        const dates = (await get('2026-03')).body.details.filter((d) => d.name === '愛麗絲').map((d) => d.work_date);
        expect(dates).not.toContain('2026-03-04');
        expect(dates).not.toContain('2026-02-28');
        expect(dates).not.toContain('2026-04-01');
    });

    it('lists each shift with its own amount and flags make-up records', async () => {
        const details = (await get('2026-03')).body.details.filter((d) => d.name === '愛麗絲');
        expect(details).toHaveLength(4);
        const makeUp = details.find((d) => d.work_date === '2026-03-05');
        expect(makeUp.manual).toBe(true);
        expect(makeUp.earned).toBe(380);
        expect(details.find((d) => d.work_date === '2026-03-02').earned).toBe(1615);
        expect(details.find((d) => d.work_date === '2026-03-03' && d.punch_type === '正常').earned).toBe(633);
    });

    it('keeps employees separate and pays nothing at an hourly rate of 0', async () => {
        const rows = (await get('2026-03')).body.summary;
        const bobRow = rows.find((s) => s.name === '鮑伯');
        expect(bobRow.total_hours).toBe('4.00');
        expect(bobRow.total_salary).toBe(0);
        expect(rows).toHaveLength(2);
    });

    it('reports the other months separately', async () => {
        const feb = (await get('2026-02')).body.summary.find((s) => s.name === '愛麗絲');
        expect(feb.total_salary).toBe(1520);   // 8 小時 × 190
        const apr = (await get('2026-04')).body.summary.find((s) => s.name === '愛麗絲');
        expect(apr.total_salary).toBe(1520);
    });

    it('applies the current hourly rate when it is changed', async () => {
        await prisma.user.update({ where: { id: alice.id }, data: { hourly_rate: 200 } });
        const row = (await get('2026-03')).body.summary.find((s) => s.name === '愛麗絲');
        // 8.5×200 + 3.3333×200 + 2×200 + 2×200 = 1700 + 667 + 400 + 400
        expect(row.total_salary).toBe(3167);
    });
});
