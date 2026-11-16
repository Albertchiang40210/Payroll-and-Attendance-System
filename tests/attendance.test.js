const request = require('supertest');
const app = require('../src/app');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let token;
let userId;

beforeAll(async () => {
    // Clear old data for test consistency
    await prisma.attendance.deleteMany();
    await prisma.user.deleteMany();

    // Create a test user directly via Prisma
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash('password123', 10);
    const user = await prisma.user.create({
        data: {
            username: 'testuser',
            password: hashedPassword,
            name: 'Test User',
            role: 'EMPLOYEE',
            hourly_rate: 150
        }
    });
    userId = user.id;

    // Login to get token
    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
            username: 'testuser',
            password: 'password123'
        });
    
    token = loginRes.body.token;
});

afterAll(async () => {
    await prisma.attendance.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
});

describe('Attendance API', () => {
    it('should block unauthenticated access', async () => {
        const res = await request(app).post('/api/clock').send({ type: 'in' });
        expect(res.statusCode).toEqual(401);
    });

    it('should allow clock in', async () => {
        const res = await request(app)
            .post('/api/clock')
            .set('Authorization', `Bearer ${token}`)
            .send({ type: 'in', punch_type: '正常' });
        
        expect(res.statusCode).toEqual(200);
        expect(res.body.status).toBe('success');
    });

    it('should block double clock in', async () => {
        const res = await request(app)
            .post('/api/clock')
            .set('Authorization', `Bearer ${token}`)
            .send({ type: 'in', punch_type: '正常' });
        
        expect(res.statusCode).toEqual(400);
        expect(res.body.status).toBe('error');
    });

    it('should allow clock out', async () => {
        const res = await request(app)
            .post('/api/clock')
            .set('Authorization', `Bearer ${token}`)
            .send({ type: 'out', punch_type: '正常' });
        
        expect(res.statusCode).toEqual(200);
        expect(res.body.status).toBe('success');
    });

    // ---- 加班打卡：需先完成今天的正常班上下班 ----
    const clock = (body) =>
        request(app).post('/api/clock').set('Authorization', `Bearer ${token}`).send(body);

    it('should report today\'s own punch state', async () => {
        const res = await request(app)
            .get('/api/attendance/my-today')
            .set('Authorization', `Bearer ${token}`);

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].punch_type).toBe('正常');
        expect(res.body[0].log_out).not.toBeNull();
    });

    it('should block overtime clock out before overtime clock in', async () => {
        const res = await clock({ type: 'out', punch_type: '加班' });
        expect(res.statusCode).toEqual(400);
    });

    it('should allow overtime clock in after normal shift is finished', async () => {
        const res = await clock({ type: 'in', punch_type: '加班' });
        expect(res.statusCode).toEqual(200);
    });

    it('should allow overtime clock out', async () => {
        const res = await clock({ type: 'out', punch_type: '加班' });
        expect(res.statusCode).toEqual(200);
    });
});

describe('Overtime prerequisite', () => {
    it('should block overtime clock in when normal shift is not finished', async () => {
        // 清掉今天的紀錄，模擬「還沒打正常班」
        await prisma.attendance.deleteMany({ where: { userId } });

        const noNormal = await request(app)
            .post('/api/clock')
            .set('Authorization', `Bearer ${token}`)
            .send({ type: 'in', punch_type: '加班' });
        expect(noNormal.statusCode).toEqual(400);

        // 只打了正常上班、還沒下班，同樣不可打加班
        await request(app).post('/api/clock').set('Authorization', `Bearer ${token}`).send({ type: 'in' });
        const notClockedOut = await request(app)
            .post('/api/clock')
            .set('Authorization', `Bearer ${token}`)
            .send({ type: 'in', punch_type: '加班' });
        expect(notClockedOut.statusCode).toEqual(400);
    });
});
