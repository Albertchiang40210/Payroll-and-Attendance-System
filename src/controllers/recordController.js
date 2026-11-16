const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const catchAsync = require('../utils/catchAsync');
const { computeDayOffs } = require('../services/punchService');

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

const httpError = (status, message) => {
    const error = new Error(message);
    error.statusCode = status;
    return error;
};

const fmt = (d, f) => dayjs(d).tz(TZ).format(f);

const getEmployee = async (userId) => {
    const user = await prisma.user.findFirst({ where: { id: userId, role: 'EMPLOYEE' } });
    if (!user) throw httpError(404, '找不到此員工。');
    return user;
};

// 檢查並轉換補登的時間：日期要真實存在、不可是未來、下班需晚於上班
const buildTimes = (workDate, inTime, outTime) => {
    if (dayjs.utc(workDate).format('YYYY-MM-DD') !== workDate) throw httpError(400, '日期不正確。');

    const now = dayjs().tz(TZ);
    const clockIn = dayjs.tz(`${workDate} ${inTime}`, TZ);
    if (clockIn.isAfter(now)) throw httpError(400, '不能補登未來的時間。');

    let clockOut = null;
    if (outTime) {
        clockOut = dayjs.tz(`${workDate} ${outTime}`, TZ);
        if (clockOut.isAfter(now)) throw httpError(400, '不能補登未來的時間。');
        if (!clockOut.isAfter(clockIn)) throw httpError(400, '下班時間必須晚於上班時間。');
    }
    return { clockIn: clockIn.toDate(), clockOut: clockOut ? clockOut.toDate() : null };
};

const present = (a) => ({
    id: a.id,
    work_date: a.work_date,
    punch_type: a.punch_type,
    log_in: fmt(a.clock_in, 'HH:mm:ss'),
    log_out: a.clock_out ? fmt(a.clock_out, 'HH:mm:ss') : null,
    manual: a.manual,
    note: a.note
});

// 某員工某月的紀錄，加上整天沒打卡（休假）的日期
exports.listMonth = catchAsync(async (req, res) => {
    const userId = Number(req.query.userId);
    const { month } = req.query;
    const user = await getEmployee(userId);

    const records = await prisma.attendance.findMany({
        where: { userId, work_date: { startsWith: month } },
        orderBy: [{ work_date: 'desc' }, { clock_in: 'desc' }]
    });

    const monthStart = `${month}-01`;
    const monthEnd = dayjs.utc(monthStart).endOf('month').format('YYYY-MM-DD');
    // 已停用（離職）的員工不計算休假
    const dayOffs = user.active
        ? computeDayOffs({
              createdAt: user.createdAt,
              workedDates: new Set(records.map((r) => r.work_date)),
              from: monthStart,
              to: monthEnd
          }).reverse()
        : [];

    res.json({ name: user.name, records: records.map(present), day_offs: dayOffs });
});

exports.create = catchAsync(async (req, res) => {
    const { userId, work_date, punch_type, clock_in, clock_out, note } = req.body;
    const user = await getEmployee(userId);

    const existing = await prisma.attendance.findFirst({ where: { userId, work_date, punch_type } });
    if (existing) {
        throw httpError(400, `${user.name} 在 ${work_date} 已有【${punch_type}】紀錄，請改用「修改」。`);
    }

    const { clockIn, clockOut } = buildTimes(work_date, clock_in, clock_out);
    const record = await prisma.attendance.create({
        data: {
            userId, work_date, punch_type,
            clock_in: clockIn, clock_out: clockOut,
            manual: true, note: note || null
        }
    });
    res.json({ message: `✅ 已補登 ${user.name} ${work_date} 的【${punch_type}】紀錄`, data: present(record) });
});

exports.update = catchAsync(async (req, res) => {
    const id = Number(req.params.id);
    const record = await prisma.attendance.findUnique({ where: { id } });
    if (!record) throw httpError(404, '找不到這筆紀錄。');

    const { clock_in, clock_out, note } = req.body;
    const inTime = clock_in !== undefined ? clock_in : fmt(record.clock_in, 'HH:mm');
    const outTime = clock_out !== undefined ? clock_out : record.clock_out ? fmt(record.clock_out, 'HH:mm') : null;

    const { clockIn, clockOut } = buildTimes(record.work_date, inTime, outTime);
    const updated = await prisma.attendance.update({
        where: { id },
        data: {
            clock_in: clockIn,
            clock_out: clockOut,
            manual: true,
            ...(note !== undefined && { note: note || null })
        }
    });
    res.json({ message: '✏️ 紀錄已修改', data: present(updated) });
});

exports.remove = catchAsync(async (req, res) => {
    const id = Number(req.params.id);
    const record = await prisma.attendance.findUnique({ where: { id } });
    if (!record) throw httpError(404, '找不到這筆紀錄。');
    await prisma.attendance.delete({ where: { id } });
    res.json({ message: '🗑️ 紀錄已刪除' });
});
