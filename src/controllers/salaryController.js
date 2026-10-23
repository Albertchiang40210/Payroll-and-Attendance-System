const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const catchAsync = require('../utils/catchAsync');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

exports.getSalaryReport = catchAsync(async (req, res) => {
    const { month } = req.query; 
    if (!month) {
        const error = new Error('請提供查詢月份');
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
    
    // Process advanced overtime logic
    const summaryMap = {};
    const details = [];
    
    attendances.forEach(a => {
        const userId = a.userId;
        const user = a.user;
        const clockIn = dayjs(a.clock_in).tz(TZ);
        const clockOut = dayjs(a.clock_out).tz(TZ);
        const diffMinutes = clockOut.diff(clockIn, 'minute');
        const dayHours = diffMinutes / 60;
        
        let calculatedSalaryForDay = 0;
        
        if (a.punch_type === '加班' || dayHours > 8) {
            // Overtime logic: First 8 hours normal rate, then 1.34x for next 2 hours, then 1.67x
            if (dayHours > 8) {
                const normalHours = 8;
                const ot1Hours = Math.min(dayHours - 8, 2);
                const ot2Hours = Math.max(dayHours - 10, 0);
                calculatedSalaryForDay = (normalHours * user.hourly_rate) + 
                                         (ot1Hours * user.hourly_rate * 1.34) + 
                                         (ot2Hours * user.hourly_rate * 1.67);
            } else {
                // Whole shift is overtime? Just standard 1.34x for simplicity if punch_type = '加班'
                calculatedSalaryForDay = (dayHours * user.hourly_rate * 1.34);
            }
        } else {
            // Normal
            calculatedSalaryForDay = dayHours * user.hourly_rate;
        }
        
        calculatedSalaryForDay = Math.round(calculatedSalaryForDay);
        
        details.push({
            work_date: a.work_date,
            name: user.name,
            punch_type: a.punch_type,
            log_in: clockIn.format('HH:mm:ss'),
            log_out: clockOut.format('HH:mm:ss'),
            day_hours: dayHours.toFixed(2),
            earned: calculatedSalaryForDay
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
    
    const summary = Object.values(summaryMap).map(s => ({
        ...s,
        total_hours: s.total_hours.toFixed(2)
    }));
    
    res.json({ summary, details });
});
