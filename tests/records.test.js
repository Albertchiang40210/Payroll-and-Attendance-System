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
let empToken;
let employee;
let recordId;

const asAdmin = (req) => req.set('Authorization', `Bearer ${adminToken}`);

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
    employee = await prisma.user.create({
        data: {
            username: 'emp', password: hashed, name: '王小明', role: 'EMPLOYEE', hourly_rate: 200,
            createdAt: today.subtract(10, 'day').toDate()
        }
    });
    adminToken = (await request(app).post('/api/auth/login').send({ username: 'boss', password: 'password123' })).body.token;
    empToken = (await request(app).post('/api/auth/login').send({ username: 'emp', password: 'password123' })).body.token;
});

afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
});

describe('Make-up punch access control', () => {
    it('blocks unauthenticated requests', async () => {
        const res = await request(app).post('/api/records').send({});
        expect(res.statusCode).toEqual(401);
    });

    it('blocks employees from adding or editing records', async () => {
        const res = await request(app)
            .post('/api/records')
            .set('Authorization', `Bearer ${empToken}`)
            .send({ userId: employee.id, work_date: ymd(1), clock_in: '09:00', clock_out: '13:00' });
        expect(res.statusCode).toEqual(403);
    });
});

describe('Make-up punch validation', () => {
    const create = (body) => asAdmin(request(app).post('/api/records')).send({ userId: employee.id, ...body });

    it('rejects a future date', async () => {
        const res = await create({ work_date: today.add(1, 'day').format('YYYY-MM-DD'), clock_in: '09:00' });
        expect(res.statusCode).toEqual(400);
    });

    it('rejects a date that does not exist', async () => {
        const res = await create({ work_date: '2026-02-31', clock_in: '09:00' });
        expect(res.statusCode).toEqual(400);
    });

    it('rejects clock out that is not after clock in', async () => {
        const res = await create({ work_date: ymd(1), clock_in: '13:00', clock_out: '09:00' });
        expect(res.statusCode).toEqual(400);
    });

    it('rejects a malformed time', async () => {
        const res = await create({ work_date: ymd(1), clock_in: '9am' });
        expect(res.statusCode).toEqual(400);
    });

    it('rejects an unknown employee', async () => {
        const res = await create({ userId: 999999, work_date: ymd(1), clock_in: '09:00' });
        expect(res.statusCode).toEqual(404);
    });
});

describe('Make-up punch lifecycle', () => {
    it('shows the day as a day off before it is filled in', async () => {
        const res = await asAdmin(request(app).get(`/api/records?userId=${employee.id}&month=${ymd(1).slice(0, 7)}`));
        expect(res.statusCode).toEqual(200);
        expect(res.body.day_offs).toContain(ymd(1));
    });

    it('adds a record and flags it as manual', async () => {
        const res = await asAdmin(request(app).post('/api/records')).send({
            userId: employee.id, work_date: ymd(1), clock_in: '09:00', clock_out: '13:00', note: '忘記打卡'
        });
        expect(res.statusCode).toEqual(200);
        expect(res.body.data.manual).toBe(true);
        expect(res.body.data.log_in).toBe('09:00:00');
        recordId = res.body.data.id;
    });

    it('blocks a duplicate record for the same day and type', async () => {
        const res = await asAdmin(request(app).post('/api/records')).send({
            userId: employee.id, work_date: ymd(1), clock_in: '10:00'
        });
        expect(res.statusCode).toEqual(400);
    });

    it('no longer counts that day as a day off', async () => {
        const res = await asAdmin(request(app).get(`/api/records?userId=${employee.id}&month=${ymd(1).slice(0, 7)}`));
        expect(res.body.day_offs).not.toContain(ymd(1));
        expect(res.body.records.find((r) => r.id === recordId).note).toBe('忘記打卡');
    });

    it('counts the hours in the salary report', async () => {
        const res = await asAdmin(request(app).get(`/api/salary?month=${ymd(1).slice(0, 7)}`));
        const row = res.body.summary.find((s) => s.name === '王小明');
        expect(Number(row.total_hours)).toBe(4);
        expect(row.total_salary).toBe(800);
        expect(res.body.details.find((d) => d.work_date === ymd(1) && !d.day_off).manual).toBe(true);
    });

    it('shows the manual flag to the employee', async () => {
        const res = await request(app).get('/api/attendance/my-records').set('Authorization', `Bearer ${empToken}`);
        const rec = res.body.recent.find((r) => r.work_date === ymd(1) && !r.day_off);
        expect(rec.manual).toBe(true);
    });

    it('edits the clock out time', async () => {
        const res = await asAdmin(request(app).put(`/api/records/${recordId}`)).send({ clock_out: '14:00' });
        expect(res.statusCode).toEqual(200);
        expect(res.body.data.log_out).toBe('14:00:00');
        expect(res.body.data.log_in).toBe('09:00:00');
    });

    it('refuses an edit that puts clock out before clock in', async () => {
        const res = await asAdmin(request(app).put(`/api/records/${recordId}`)).send({ clock_out: '08:00' });
        expect(res.statusCode).toEqual(400);
    });

    it('can clear the clock out time', async () => {
        const res = await asAdmin(request(app).put(`/api/records/${recordId}`)).send({ clock_out: null });
        expect(res.body.data.log_out).toBeNull();
    });

    it('deletes the record and the day becomes a day off again', async () => {
        const del = await asAdmin(request(app).delete(`/api/records/${recordId}`));
        expect(del.statusCode).toEqual(200);

        const res = await asAdmin(request(app).get(`/api/records?userId=${employee.id}&month=${ymd(1).slice(0, 7)}`));
        expect(res.body.day_offs).toContain(ymd(1));
    });

    it('returns 404 when deleting a record that does not exist', async () => {
        const res = await asAdmin(request(app).delete('/api/records/999999'));
        expect(res.statusCode).toEqual(404);
    });
});

describe('Deactivated employees', () => {
    it('does not report day offs for a deactivated employee', async () => {
        await prisma.user.update({ where: { id: employee.id }, data: { active: false } });
        const res = await asAdmin(request(app).get(`/api/records?userId=${employee.id}&month=${ymd(1).slice(0, 7)}`));
        expect(res.body.day_offs).toEqual([]);
    });
});
