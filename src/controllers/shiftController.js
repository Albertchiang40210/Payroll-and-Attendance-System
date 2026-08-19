const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const catchAsync = require('../utils/catchAsync');

exports.createShift = catchAsync(async (req, res) => {
    const { userId, date, start_time, end_time } = req.body;
    
    if (!userId || !date || !start_time || !end_time) {
        const error = new Error('請提供完整的排班資訊');
        error.statusCode = 400;
        throw error;
    }
    
    const shift = await prisma.shift.create({
        data: {
            userId: parseInt(userId),
            date,
            start_time,
            end_time
        }
    });
    
    res.status(201).json({ status: 'success', data: shift });
});

exports.getShifts = catchAsync(async (req, res) => {
    const shifts = await prisma.shift.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { date: 'asc' }
    });
    res.json(shifts);
});
