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
});
