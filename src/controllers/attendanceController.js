const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const catchAsync = require('../utils/catchAsync');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const getTaipeiTime = () => dayjs().tz('Asia/Taipei');

exports.clockInOut = catchAsync(async (req, res) => {
    // req.user is set by authMiddleware
    const userId = req.user.id;
    const { type, punch_type } = req.body; 
    const currentPunchType = punch_type || '正常'; 

    const now = getTaipeiTime();
    const today = now.format('YYYY-MM-DD');
    const timeString = now.format('HH:mm:ss');

    const attendances = await prisma.attendance.findMany({
        where: {
            userId: userId,
            work_date: today,
            punch_type: currentPunchType
        }
    });
    
    const todaysRecord = attendances[0];

    if (type === 'in') {
        if (todaysRecord) {
            const error = new Error(`❌ 您今天已經打過【${currentPunchType}】上班卡囉！`);
            error.statusCode = 400;
            throw error;
        }
        
        await prisma.attendance.create({
            data: {
                userId: userId,
                work_date: today,
                punch_type: currentPunchType,
                clock_in: now.toDate()
            }
        });
        return res.json({ status: 'success', time: timeString, message: `☀️ 【${currentPunchType}】上班打卡成功！\n時間：${timeString}` });
    
    } else if (type === 'out') {
        if (!todaysRecord) {
            const error = new Error(`❌ 您今日尚未有【${currentPunchType}】上班打卡紀錄，請先打上班卡！`);
            error.statusCode = 400;
            throw error;
        }
        if (todaysRecord.clock_out !== null) {
            const error = new Error(`❌ 您今天已經打過【${currentPunchType}】下班卡囉！`);
            error.statusCode = 400;
            throw error;
        }
        
        await prisma.attendance.update({
            where: { id: todaysRecord.id },
            data: { clock_out: now.toDate() }
        });
        return res.json({ status: 'success', time: timeString, message: `🌙 【${currentPunchType}】下班打卡成功！\n時間：${timeString}` });
    }
});

exports.getTodayAttendance = catchAsync(async (req, res) => {
    const today = getTaipeiTime().format('YYYY-MM-DD');
    const attendances = await prisma.attendance.findMany({
        where: { work_date: today },
        include: { user: { select: { name: true } } },
        orderBy: { clock_in: 'desc' }
    });
    
    const formattedRows = attendances.map(a => ({
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
