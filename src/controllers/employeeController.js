const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const catchAsync = require('../utils/catchAsync');

exports.getAllEmployees = catchAsync(async (req, res) => {
    const users = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            name: true,
            hourly_rate: true,
            role: true,
        },
    });
    res.json(users);
});

exports.createEmployee = catchAsync(async (req, res) => {
    const { username, password, name, hourly_rate, role } = req.body;
    
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
        const error = new Error('此帳號已存在');
        error.statusCode = 400;
        throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = await prisma.user.create({
        data: {
            username,
            password: hashedPassword,
            name,
            hourly_rate,
            role: role || 'EMPLOYEE',
        },
        select: {
            id: true,
            username: true,
            name: true,
            hourly_rate: true,
            role: true,
        }
    });
    
    res.json({ message: `🎉 成功新增員工：${name}`, data: newUser });
});

exports.updateEmployee = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { name, hourly_rate } = req.body;
    
    const updatedUser = await prisma.user.update({
        where: { id: parseInt(id) },
        data: { name, hourly_rate },
        select: { id: true, name: true, hourly_rate: true }
    });
    
    res.json({ message: '✏️ 員工資料修改成功！', data: updatedUser });
});

exports.deleteEmployee = catchAsync(async (req, res) => {
    const { id } = req.params;
    await prisma.user.delete({ where: { id: parseInt(id) } });
    res.json({ message: '🗑️ 員工已成功刪除' });
});
