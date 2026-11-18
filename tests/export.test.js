const request = require('supertest');
const bcrypt = require('bcrypt');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const app = require('../src/app');
const prisma = require('../src/utils/prisma');
const { buildSalaryReport } = require('../src/services/salaryService');
const { payrollSheets, detailSheets, fileNames } = require('../src/services/reportService');

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Taipei';
const at = (date, time) => dayjs.tz(`${date} ${time}`, TZ).toDate();

let adminToken;
let alice;
const get = (qs) => request(app).get(`/api/salary/export?${qs}`).set('Authorization', `Bearer ${adminToken}`);
const binary = (res, cb) => { res.buffer(true).parse((r, done) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => done(null, Buffer.concat(c))); }); return cb ? res.then(cb) : res; };
const vals = (row) => row.map((c) => (c && typeof c === 'object' ? c.value : c));
const shift = (userId, date, i, o, punch_type = '正常', extra = {}) =>
    prisma.attendance.create({
        data: { userId, work_date: date, punch_type, clock_in: at(date, i), clock_out: o ? at(date, o) : null, ...extra }
    });

async function cleanup() {
    await prisma.rateHistory.deleteMany();
    await prisma.attendance.deleteMany();
    await prisma.pairingCode.deleteMany();
    await prisma.setting.deleteMany();
    await prisma.user.deleteMany();
}

beforeAll(async () => {
    await cleanup();
    const hashed = await bcrypt.hash('password123', 10);
    await prisma.user.create({ data: { username: 'boss', password: hashed, name: 'Boss', role: 'ADMIN', hourly_rate: 0, punch: false } });
    alice = await prisma.user.create({ data: { username: 'alice', password: hashed, name: '愛麗絲', role: 'EMPLOYEE', hourly_rate: 190 } });
    adminToken = (await request(app).post('/api/auth/login').send({ username: 'boss', password: 'password123' })).body.token;

    await shift(alice.id, '2026-03-05', '10:00', '12:00', '正常', { manual: true }); // 補登 2 小時 → 380
    await shift(alice.id, '2026-03-02', '09:00', '17:30');                            // 8.5 小時 → 1615
    await shift(alice.id, '2026-03-04', '09:00', null);                               // 沒打下班卡：不計，但要提醒
});

afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
});

describe('Excel export endpoint', () => {
    it('requires an admin', async () => {
        expect((await request(app).get('/api/salary/export?month=2026-03&type=payroll')).statusCode).toEqual(401);
    });

    it('rejects a bad month or type', async () => {
        expect((await get('month=2026-3&type=payroll')).statusCode).toEqual(400);
        expect((await get('month=2026-03&type=csv')).statusCode).toEqual(400);
        expect((await get('month=2026-03')).statusCode).toEqual(400);
    });

    it.each(['payroll', 'details'])('returns a real .xlsx file for %s', async (type) => {
        const res = await binary(get(`month=2026-03&type=${type}`));
        expect(res.statusCode).toEqual(200);
        expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
        expect(res.headers['content-disposition']).toContain(encodeURIComponent(fileNames('2026-03')[type]));
        expect(res.body.subarray(0, 2).toString()).toBe('PK');   // .xlsx 是 zip 檔
    });

    it('still produces a file for a month with no records', async () => {
        for (const type of ['payroll', 'details']) {
            const res = await binary(get(`month=2020-01&type=${type}`));
            expect(res.statusCode).toEqual(200);
            expect(res.body.subarray(0, 2).toString()).toBe('PK');
        }
    });
});

describe('Payroll sheet content', () => {
    it('lists each employee, totals, and warns about a missing clock-out', async () => {
        const report = await buildSalaryReport('2026-03');
        const [sheet] = payrollSheets(report, '2026-03');
        const rows = sheet.data.map(vals);

        expect(rows[0][0]).toContain('2026 年 3 月');
        expect(rows[2].slice(0, 5)).toEqual(['員工', '時薪', '總工時（小時）', '休假天數', '應發薪資']);
        const row = rows.find((r) => r[0] === '愛麗絲');
        expect(row[1]).toBe(190);
        expect(row[2]).toBe(10.5);      // 8.5 + 2
        expect(row[4]).toBe(1995);      // 1615 + 380
        expect(row[5]).toContain('沒打下班卡');
        const total = rows.find((r) => r[0] === '合計');
        expect(total[4]).toBe(1995);
    });

    it('notes a mid-month rate change', async () => {
        const carol = await prisma.user.create({
            data: { username: 'carol', password: 'x', name: '卡蘿', role: 'EMPLOYEE', hourly_rate: 150 }
        });
        await prisma.rateHistory.createMany({ data: [
            { userId: carol.id, effective_from: '1970-01-01', hourly_rate: 100 },
            { userId: carol.id, effective_from: '2026-05-16', hourly_rate: 150 }
        ] });
        await shift(carol.id, '2026-05-15', '09:00', '11:00');
        await shift(carol.id, '2026-05-16', '09:00', '11:00');

        const report = await buildSalaryReport('2026-05');
        const row = payrollSheets(report, '2026-05')[0].data.map(vals).find((r) => r[0] === '卡蘿');
        expect(row[4]).toBe(500);
        expect(row[5]).toContain('月中調整時薪');

        const sheet = detailSheets(report, '2026-05').find((s) => s.sheet === '卡蘿');
        const days = sheet.data.map(vals).filter((r) => /^2026-05/.test(r[0]));
        expect(days.map((r) => [r[0], r[6], r[7]])).toEqual([['2026-05-15', 100, 200], ['2026-05-16', 150, 300]]);
    });
});

describe('Detail sheets content', () => {
    it('gives each employee a sheet with sorted days, a flagged missing day, and a matching total', async () => {
        const report = await buildSalaryReport('2026-03');
        const sheets = detailSheets(report, '2026-03');
        const sheet = sheets.find((s) => s.sheet === '愛麗絲');
        const rows = sheet.data.map(vals);

        const days = rows.filter((r) => /^2026-03/.test(r[0]));
        expect(days.map((r) => r[0])).toEqual(['2026-03-02', '2026-03-04', '2026-03-05']);   // 由前到後
        expect(days[0]).toEqual(['2026-03-02', '一', '正常', '09:00:00', '17:30:00', 8.5, 190, 1615, '']);
        expect(days[1][8]).toContain('沒打下班卡');                                           // 未完成的日子被標出來
        expect(days[1][7]).toBe('');                                                          // 且沒有金額
        expect(days[2][8]).toBe('補登');

        const total = rows[rows.length - 1];
        expect(total[0]).toBe('合計');
        expect(total[7]).toBe(1995);                                                          // 與彙總一致
        expect(total[7]).toBe(report.summary.find((s) => s.name === '愛麗絲').total_salary);
    });

    it('makes sheet names valid and unique', async () => {
        const hashed = 'x';
        await prisma.user.create({ data: { username: 'p1', password: hashed, name: '王/小:明?', role: 'EMPLOYEE', hourly_rate: 100 } });
        await prisma.user.create({ data: { username: 'p2', password: hashed, name: '王小明', role: 'EMPLOYEE', hourly_rate: 100 } });
        await prisma.user.create({ data: { username: 'p3', password: hashed, name: '王小明', role: 'EMPLOYEE', hourly_rate: 100 } });
        const users = await prisma.user.findMany({ where: { username: { in: ['p1', 'p2', 'p3'] } } });
        for (const u of users) await shift(u.id, '2026-07-01', '09:00', '10:00');

        const names = detailSheets(await buildSalaryReport('2026-07'), '2026-07').map((s) => s.sheet);
        expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
        names.forEach((n) => {
            expect(n.length).toBeLessThanOrEqual(31);
            expect(n).not.toMatch(/[\[\]:*?/\\]/);
        });
    });
});
