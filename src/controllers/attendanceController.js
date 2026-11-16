const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const catchAsync = require('../utils/catchAsync');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { performPunch, getTodayRecords, getRecentRecords, getTaipeiTime } = require('../services/punchService');

dayjs.extend(utc);
dayjs.extend(timezone);

exports.clockInOut = catchAsync(async (req, res) => {
    const { type, punch_type } = req.body;
    const result = await performPunch({
        userId: req.user.id,
        type,
        punchType: punch_type || '正常'
    });
    res.json({ status: 'success', time: result.time, message: result.message });
});

exports.getMyToday = catchAsync(async (req, res) => {
    res.json(await getTodayRecords(req.user.id));
});

exports.getMyRecords = catchAsync(async (req, res) => {
    res.json(await getRecentRecords(req.user.id, 14));
});

// 老闆查詢「某一天」誰有上班、誰沒打卡（過去的日子沒打卡即為休假）
exports.getDayAttendance = catchAsync(async (req, res) => {
    const { date } = req.query;
    const todayStr = getTaipeiTime().format('YYYY-MM-DD');

    if (dayjs.utc(date).format('YYYY-MM-DD') !== date) {
        const error = new Error('日期不正確。');
        error.statusCode = 400;
        throw error;
    }
    if (date > todayStr) {
        const error = new Error('不能查詢未來的日期。');
        error.statusCode = 400;
        throw error;
    }

    const [records, staff] = await Promise.all([
        prisma.attendance.findMany({
            where: { work_date: date },
            include: { user: { select: { name: true } } },
            orderBy: { clock_in: 'asc' }
        }),
        prisma.user.findMany({
            where: { role: 'EMPLOYEE', active: true },
            select: { id: true, name: true, createdAt: true }
        })
    ]);

    const rows = records.map(a => ({
        userId: a.userId,
        name: a.user.name,
        punch_type: a.punch_type,
        log_in: dayjs(a.clock_in).tz('Asia/Taipei').format('HH:mm:ss'),
        log_out: a.clock_out ? dayjs(a.clock_out).tz('Asia/Taipei').format('HH:mm:ss') : null,
        manual: a.manual
    }));

    // 當天沒有任何打卡、且當天已到職的在職員工
    const worked = new Set(records.map(r => r.userId));
    const absent = staff
        .filter(u => !worked.has(u.id) && dayjs(u.createdAt).tz('Asia/Taipei').format('YYYY-MM-DD') <= date)
        .map(u => u.name);

    res.json({ date, is_today: date === todayStr, rows, absent });
});

exports.getTodayAttendance = catchAsync(async (req, res) => {
    const today = getTaipeiTime().format('YYYY-MM-DD');
    const attendances = await prisma.attendance.findMany({
        where: { work_date: today },
        include: { user: { select: { name: true } } },
        orderBy: { clock_in: 'desc' }
    });
    
    const formattedRows = attendances.map(a => ({
        userId: a.userId,
        name: a.user.name,
        punch_type: a.punch_type,
        log_in: dayjs(a.clock_in).tz('Asia/Taipei').format('HH:mm:ss'),
        log_out: a.clock_out ? dayjs(a.clock_out).tz('Asia/Taipei').format('HH:mm:ss') : null
    }));
    
    res.json(formattedRows);
});

exports.aiRecognize = catchAsync(async (req, res) => {
    const { image_base64 } = req.body;
    
    // Simulate AI Processing delay
    await new Promise(r => setTimeout(r, 1000));
    
    // Stub logic: Randomly select an existing employee to mock a successful recognition
    const users = await prisma.user.findMany({ where: { role: 'EMPLOYEE' } });
    if (users.length === 0) {
        return res.status(404).json({ status: 'fail', message: '尚未建立任何員工資料以供辨識測試。' });
    }
    
    const randomUser = users[Math.floor(Math.random() * users.length)];
    
    res.json({ 
        status: 'success', 
        message: 'AI 視覺辨識成功',
        data: {
            recognized_user: randomUser.name,
            confidence: 0.98,
            next_action: "您可以呼叫 /api/clock 進行打卡"
        }
    });
});
