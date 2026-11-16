const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';
const getTaipeiTime = () => dayjs().tz(TZ);

const fail = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};

/**
 * 打卡核心邏輯（登入者打卡與店內裝置打卡共用）。
 * type: 'in' | 'out'；punchType: '正常' | '加班'
 */
exports.performPunch = async ({ userId, type, punchType = '正常' }) => {
    const now = getTaipeiTime();
    const today = now.format('YYYY-MM-DD');
    const timeString = now.format('HH:mm:ss');

    // 加班打卡的前提：今天已完成正常班的上班與下班打卡（避免誤按）
    if (punchType === '加班') {
        const normalRecord = await prisma.attendance.findFirst({
            where: { userId, work_date: today, punch_type: '正常' }
        });
        if (!normalRecord || normalRecord.clock_out === null) {
            throw fail('❌ 加班打卡需先完成今天的「正常」上班與下班打卡。');
        }
    }

    const todaysRecord = await prisma.attendance.findFirst({
        where: { userId, work_date: today, punch_type: punchType }
    });

    if (type === 'in') {
        if (todaysRecord) {
            throw fail(`❌ 您今天已經打過【${punchType}】上班卡囉！`);
        }
        await prisma.attendance.create({
            data: { userId, work_date: today, punch_type: punchType, clock_in: now.toDate() }
        });
        return { time: timeString, message: `☀️ 【${punchType}】上班打卡成功！\n時間：${timeString}` };
    }

    if (!todaysRecord) {
        throw fail(`❌ 您今日尚未有【${punchType}】上班打卡紀錄，請先打上班卡！`);
    }
    if (todaysRecord.clock_out !== null) {
        throw fail(`❌ 您今天已經打過【${punchType}】下班卡囉！`);
    }
    await prisma.attendance.update({
        where: { id: todaysRecord.id },
        data: { clock_out: now.toDate() }
    });
    return { time: timeString, message: `🌙 【${punchType}】下班打卡成功！\n時間：${timeString}` };
};

// 某員工今天的打卡紀錄（供畫面判斷哪些按鈕可按）
exports.getTodayRecords = async (userId) => {
    const today = getTaipeiTime().format('YYYY-MM-DD');
    const records = await prisma.attendance.findMany({
        where: { userId, work_date: today },
        orderBy: { clock_in: 'asc' }
    });
    return records.map((a) => ({
        punch_type: a.punch_type,
        log_in: dayjs(a.clock_in).tz(TZ).format('HH:mm:ss'),
        log_out: a.clock_out ? dayjs(a.clock_out).tz(TZ).format('HH:mm:ss') : null
    }));
};

// 最近 N 天（含今天）的打卡紀錄，新到舊排序
exports.getRecentRecords = async (userId, days = 14) => {
    const today = getTaipeiTime();
    const since = today.subtract(days - 1, 'day').format('YYYY-MM-DD');
    const records = await prisma.attendance.findMany({
        where: { userId, work_date: { gte: since } },
        orderBy: [{ work_date: 'desc' }, { clock_in: 'desc' }]
    });
    const rows = records.map((a) => ({
        work_date: a.work_date,
        punch_type: a.punch_type,
        log_in: dayjs(a.clock_in).tz(TZ).format('HH:mm:ss'),
        log_out: a.clock_out ? dayjs(a.clock_out).tz(TZ).format('HH:mm:ss') : null
    }));
    const todayStr = today.format('YYYY-MM-DD');
    return { today: rows.filter((r) => r.work_date === todayStr), recent: rows };
};

exports.getTaipeiTime = getTaipeiTime;
