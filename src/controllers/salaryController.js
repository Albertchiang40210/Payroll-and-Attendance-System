const prisma = require('../utils/prisma');
const catchAsync = require('../utils/catchAsync');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { computeDayOffs } = require('../services/punchService');

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

exports.getSalaryReport = catchAsync(async (req, res) => {
    const { month } = req.query; 
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        const error = new Error('請提供正確的查詢月份（YYYY-MM）');
        error.statusCode = 400;
        throw error;
    }
    
    // Fetch all attendances for the month with user data
    const attendances = await prisma.attendance.findMany({
        where: {
            work_date: {
                startsWith: month
            },
            clock_out: {
                not: null
            }
        },
        include: {
            user: true
        },
        orderBy: [
            { work_date: 'desc' },
            { clock_in: 'desc' }
        ]
    });
    
    // 逐筆計算工時與薪資
    const summaryMap = {};
    const details = [];
    
    attendances.forEach(a => {
        const userId = a.userId;
        const user = a.user;
        const clockIn = dayjs(a.clock_in).tz(TZ);
        const clockOut = dayjs(a.clock_out).tz(TZ);
        const diffMinutes = clockOut.diff(clockIn, 'minute');
        const dayHours = diffMinutes / 60;
        
        // 一律按時薪 × 工時計算（含加班，不加成）
        let calculatedSalaryForDay = dayHours * user.hourly_rate;
        
        calculatedSalaryForDay = Math.round(calculatedSalaryForDay);
        
        details.push({
            emp_id: userId,
            work_date: a.work_date,
            name: user.name,
            punch_type: a.punch_type,
            log_in: clockIn.format('HH:mm:ss'),
            log_out: clockOut.format('HH:mm:ss'),
            day_hours: dayHours.toFixed(2),
            earned: calculatedSalaryForDay,
            manual: a.manual
        });
        
        if (!summaryMap[userId]) {
            summaryMap[userId] = {
                emp_id: userId,
                name: user.name,
                hourly_rate: user.hourly_rate,
                total_hours: 0,
                total_salary: 0
            };
        }
        
        summaryMap[userId].total_hours += dayHours;
        summaryMap[userId].total_salary += calculatedSalaryForDay;
    });
    
    // ---- 休假：整天沒有任何打卡紀錄的日子（只算在職員工，且只算到昨天）----
    const monthStart = `${month}-01`;
    const monthEnd = dayjs.utc(monthStart).endOf('month').format('YYYY-MM-DD');

    const [workedRows, staff] = await Promise.all([
        // 只要有打卡（即使沒打下班卡）就不算休假
        prisma.attendance.findMany({
            where: { work_date: { startsWith: month } },
            select: { userId: true, work_date: true }
        }),
        prisma.user.findMany({ where: { punch: true, active: true } })
    ]);

    const workedByUser = {};
    workedRows.forEach((r) => {
        (workedByUser[r.userId] = workedByUser[r.userId] || new Set()).add(r.work_date);
    });

    const dayOffCount = {};
    staff.forEach((u) => {
        const dayOffs = computeDayOffs({
            createdAt: u.createdAt,
            workedDates: workedByUser[u.id] || new Set(),
            from: monthStart,
            to: monthEnd
        });
        dayOffCount[u.id] = dayOffs.length;
        dayOffs.forEach((d) =>
            details.push({
                emp_id: u.id, work_date: d, name: u.name, punch_type: '休假',
                log_in: null, log_out: null, day_hours: '0.00', earned: 0, day_off: true
            })
        );

        // 整個月都沒有打卡紀錄的員工也要出現在彙總表
        if (!summaryMap[u.id] && u.createdAt && dayOffs.length > 0) {
            summaryMap[u.id] = {
                emp_id: u.id, name: u.name, hourly_rate: u.hourly_rate, total_hours: 0, total_salary: 0
            };
        }
    });

    details.sort((a, b) =>
        a.work_date === b.work_date ? a.name.localeCompare(b.name, 'zh-TW') : a.work_date < b.work_date ? 1 : -1
    );

    const summary = Object.values(summaryMap).map(s => ({
        ...s,
        total_hours: s.total_hours.toFixed(2),
        day_off_count: dayOffCount[s.emp_id] || 0
    }));
    
    res.json({ summary, details });
});
