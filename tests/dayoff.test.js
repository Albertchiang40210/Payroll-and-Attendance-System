const request = require('supertest');
const bcrypt = require('bcrypt');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const app = require('../src/app');
const { PrismaClient } = require('@prisma/client');

dayjs.extend(utc);
dayjs.extend(timezone);
const prisma = new PrismaClient();
const TZ = 'Asia/Taipei';

const today = dayjs().tz(TZ);
const ymd = (offset) => today.subtract(offset, 'day').format('YYYY-MM-DD');

let adminToken;
let veteran;   // 10 天前到職，其中 3 天前、5 天前有打卡
let newcomer;  // 今天才到職
let veteranToken;

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
        data: { username: 'boss', password: hashed, name: 'Boss', role: 'ADMIN', hourly_rate: 0 }
    });
    veteran = await prisma.user.create({
        data: {
            username: 'veteran', password: hashed, name: '資深員工', role: 'EMPLOYEE', hourly_rate: 200,
            createdAt: today.subtract(10, 'day').toDate()
        }
    });
    newcomer = await prisma.user.create({
        data: { username: 'newcomer', password: hashed, name: '新員工', role: 'EMPLOYEE', hourly_rate: 200 }
    });

    for (const offset of [3, 5]) {
        await prisma.attendance.create({
            data: {
                userId: veteran.id,
                work_date: ymd(offset),
                clock_in: today.subtract(offset, 'day').hour(9).minute(0).second(0).toDate(),
                clock_out: today.subtract(offset, 'day').hour(13).minute(0).second(0).toDate()
            }
        });
    }

    const admin = await request(app).post('/api/auth/login').send({ username: 'boss', password: 'password123' });
    adminToken = admin.body.token;
    const vet = await request(app).post('/api/auth/login').send({ username: 'veteran', password: 'password123' });
    veteranToken = vet.body.token;
});

afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
});

describe('Day off in the employee record list', () => {
    it('marks days with no punch at all as 休假, from the join date up to yesterday', async () => {
        const res = await request(app).get('/api/attendance/my-records').set('Authorization', `Bearer ${veteranToken}`);
        expect(res.statusCode).toEqual(200);

        const dayOffs = res.body.recent.filter((r) => r.day_off).map((r) => r.work_date).sort();
        // 到職日（10 天前）～昨天共 10 天，扣掉有打卡的 3、5 天前 → 8 天
        const expected = [10, 9, 8, 7, 6, 4, 2, 1].map(ymd).sort();
        expect(dayOffs).toEqual(expected);
        expect(res.body.recent.find((r) => r.day_off).punch_type).toBe('休假');
    });

    it('does not mark days before the join date', async () => {
        const res = await request(app).get('/api/attendance/my-records').set('Authorization', `Bearer ${veteranToken}`);
        expect(res.body.recent.some((r) => r.work_date === ymd(11))).toBe(false);
    });

    it('does not mark today as a day off (the day is not over yet)', async () => {
        const res = await request(app).get('/api/attendance/my-records').set('Authorization', `Bearer ${veteranToken}`);
        expect(res.body.recent.some((r) => r.work_date === ymd(0))).toBe(false);
        expect(res.body.today).toEqual([]);
    });

    it('keeps days with punches as normal records', async () => {
        const res = await request(app).get('/api/attendance/my-records').set('Authorization', `Bearer ${veteranToken}`);
        const worked = res.body.recent.filter((r) => !r.day_off);
        expect(worked.map((r) => r.work_date).sort()).toEqual([ymd(5), ymd(3)].sort());
    });

    it('gives a brand-new employee no day off', async () => {
        const login = await request(app).post('/api/auth/login').send({ username: 'newcomer', password: 'password123' });
        const res = await request(app).get('/api/attendance/my-records').set('Authorization', `Bearer ${login.body.token}`);
        expect(res.body.recent).toEqual([]);
    });
});

describe('Day off in the salary report', () => {
    // 以與系統相同的規則，算出「本月」的預期休假天數
    const month = today.format('YYYY-MM');
    const monthStart = `${month}-01`;
    const expectedDayOffs = [10, 9, 8, 7, 6, 4, 2, 1]
        .map(ymd)
        .filter((d) => d.startsWith(month) && d >= monthStart);

    it('rejects a malformed month', async () => {
        const res = await request(app).get('/api/salary?month=2026-13').set('Authorization', `Bearer ${adminToken}`);
        expect(res.statusCode).toEqual(400);
    });

    it('reports the number of day-off days per employee', async () => {
        const res = await request(app).get(`/api/salary?month=${month}`).set('Authorization', `Bearer ${adminToken}`);
        expect(res.statusCode).toEqual(200);

        const row = res.body.summary.find((s) => s.name === '資深員工');
        expect(row.day_off_count).toBe(expectedDayOffs.length);

        const offRows = res.body.details.filter((d) => d.day_off && d.name === '資深員工');
        expect(offRows.map((d) => d.work_date).sort()).toEqual([...expectedDayOffs].sort());
        offRows.forEach((d) => expect(d.earned).toBe(0));
    });

    it('does not count day-offs as paid time', async () => {
        const res = await request(app).get(`/api/salary?month=${month}`).set('Authorization', `Bearer ${adminToken}`);
        const row = res.body.summary.find((s) => s.name === '資深員工');
        const workedInMonth = [3, 5].map(ymd).filter((d) => d.startsWith(month)).length;
        expect(Number(row.total_hours)).toBe(workedInMonth * 4);
        expect(row.total_salary).toBe(workedInMonth * 4 * 200);
    });
});

describe('Attendance lookup for a given day', () => {
    const day = (date, token) =>
        request(app).get(`/api/attendance/day?date=${date}`).set('Authorization', `Bearer ${token}`);

    it('lists who worked on that day', async () => {
        const res = await day(ymd(3), adminToken);
        expect(res.statusCode).toEqual(200);
        expect(res.body.is_today).toBe(false);
        expect(res.body.rows.map((r) => r.name)).toEqual(['資深員工']);
        expect(res.body.absent).toEqual([]);
    });

    it('lists employees with no punch as absent, only if already hired', async () => {
        const past = await day(ymd(1), adminToken);
        expect(past.body.rows).toEqual([]);
        // 新員工今天才到職，昨天不算他休假
        expect(past.body.absent).toEqual(['資深員工']);

        const todayRes = await day(ymd(0), adminToken);
        expect(todayRes.body.is_today).toBe(true);
        expect(todayRes.body.absent.sort()).toEqual(['新員工', '資深員工'].sort());
    });

    it('refuses a future date', async () => {
        const res = await day(today.add(1, 'day').format('YYYY-MM-DD'), adminToken);
        expect(res.statusCode).toEqual(400);
    });

    it('refuses a malformed date', async () => {
        const res = await day('2026-2-3', adminToken);
        expect(res.statusCode).toEqual(400);
    });

    it('is admin only', async () => {
        const res = await day(ymd(3), veteranToken);
        expect(res.statusCode).toEqual(403);
    });
});

