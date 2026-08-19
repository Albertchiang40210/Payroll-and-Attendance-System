const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const catchAsync = require('../utils/catchAsync');

exports.createLeave = catchAsync(async (req, res) => {
    const { start_date, end_date, reason } = req.body;
    
    if (!start_date || !end_date || !reason) {
        const error = new Error('請提供完整的請假資訊');
        error.statusCode = 400;
        throw error;
    }
    
    const leave = await prisma.leave.create({
        data: {
            userId: req.user.id,
            start_date: new Date(start_date),
            end_date: new Date(end_date),
            reason
        }
    });
    
    res.status(201).json({ status: 'success', data: leave });
});

exports.getAllLeaves = catchAsync(async (req, res) => {
    const leaves = await prisma.leave.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }
    });
    res.json(leaves);
});

exports.updateLeaveStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // APPROVED or REJECTED
    
    const leave = await prisma.leave.update({
        where: { id: parseInt(id) },
        data: { status }
    });
    
    res.json({ status: 'success', data: leave });
});
