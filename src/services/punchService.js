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

// 休假日：整天沒有任何打卡紀錄的日子。
// 只算到「昨天」（今天尚未結束，不能判定）；員工到職日之前不算。
exports.computeDayOffs = ({ createdAt, workedDates, from, to }) => {
    const todayStr = getTaipeiTime().format('YYYY-MM-DD');
    const yesterday = dayjs.utc(todayStr).subtract(1, 'day').format('YYYY-MM-DD');
    const joined = dayjs(createdAt).tz(TZ).format('YYYY-MM-DD');
    const start = from > joined ? from : joined;
    const end = to < yesterday ? to : yesterday;

    const result = [];
    const last = dayjs.utc(end);
    for (let d = dayjs.utc(start); !d.isAfter(last, 'day'); d = d.add(1, 'day')) {
        const ymd = d.format('YYYY-MM-DD');
        if (!workedDates.has(ymd)) result.push(ymd);
    }
    return result;
};

// 最近 N 天（含今天）的打卡紀錄，新到舊排序；沒有打卡的整天以「休假」列出
exports.getRecentRecords = async (userId, days = 14) => {
    const today = getTaipeiTime();
    const todayStr = today.format('YYYY-MM-DD');
    const since = today.subtract(days - 1, 'day').format('YYYY-MM-DD');

    const [records, user] = await Promise.all([
        prisma.attendance.findMany({
            where: { userId, work_date: { gte: since } },
            orderBy: [{ work_date: 'desc' }, { clock_in: 'desc' }]
        }),
        prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } })
    ]);

    const rows = records.map((a) => ({
        work_date: a.work_date,
        punch_type: a.punch_type,
        log_in: dayjs(a.clock_in).tz(TZ).format('HH:mm:ss'),
        log_out: a.clock_out ? dayjs(a.clock_out).tz(TZ).format('HH:mm:ss') : null,
        manual: a.manual
    }));

    const dayOffs = exports.computeDayOffs({
        createdAt: user.createdAt,
        workedDates: new Set(records.map((r) => r.work_date)),
        from: since,
        to: todayStr
    }).map((d) => ({ work_date: d, punch_type: '休假', log_in: null, log_out: null, day_off: true }));

    // 本月統計（只有天數與工時，不含薪資）
    const monthStr = todayStr.slice(0, 7);
    const monthRecords = await prisma.attendance.findMany({
        where: { userId, work_date: { startsWith: monthStr } }
    });
    const totalMinutes = monthRecords
        .filter((a) => a.clock_out)
        .reduce((sum, a) => sum + dayjs(a.clock_out).diff(dayjs(a.clock_in), 'minute'), 0);
    const monthDayOffs = exports.computeDayOffs({
        createdAt: user.createdAt,
        workedDates: new Set(monthRecords.map((r) => r.work_date)),
        from: `${monthStr}-01`,
        to: todayStr
    });
    const month = {
        work_days: new Set(monthRecords.map((r) => r.work_date)).size,
        total_hours: Math.round((totalMinutes / 60) * 10) / 10,
        day_off_days: monthDayOffs.length
    };

    const recent = [...rows, ...dayOffs].sort((a, b) => (a.work_date < b.work_date ? 1 : a.work_date > b.work_date ? -1 : 0));
    return { today: rows.filter((r) => r.work_date === todayStr), recent, month };
};

exports.getTaipeiTime = getTaipeiTime;
