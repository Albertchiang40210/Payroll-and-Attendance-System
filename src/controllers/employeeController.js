const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const catchAsync = require('../utils/catchAsync');

exports.getAllEmployees = catchAsync(async (req, res) => {
    const users = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            name: true,
            hourly_rate: true,
            role: true,
            punch: true,
            active: true,
            _count: { select: { attendances: true } },
        },
        orderBy: { id: 'asc' },
    });
    // 打卡筆數供前端在刪除前提醒（刪除會一併刪掉所有打卡紀錄）
    res.json(users.map(({ _count, ...u }) => ({ ...u, attendance_count: _count.attendances })));
});

exports.createEmployee = catchAsync(async (req, res) => {
    const { name, hourly_rate, role } = req.body;
    // 員工一律要打卡；管理員由老闆決定（預設不打卡）
    const punch = role === 'ADMIN' ? req.body.punch === true : true;
    // 員工不需帳密：未提供時產生隨機值（無人知道，等同無法登入）
    const username = req.body.username || `emp_${crypto.randomBytes(5).toString('hex')}`;
    const password = req.body.password || crypto.randomBytes(24).toString('hex');
    
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
            punch,
        },
        select: {
            id: true,
            username: true,
            name: true,
            hourly_rate: true,
            role: true,
            punch: true,
        }
    });
    
    res.json({ message: `🎉 成功新增員工：${name}`, data: newUser });
});

exports.updateEmployee = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { name, hourly_rate, active, punch } = req.body;
    
    const updatedUser = await prisma.user.update({
        where: { id: parseInt(id) },
        data: { name, hourly_rate, active, punch },
        select: { id: true, name: true, hourly_rate: true, active: true, punch: true }
    });
    
    res.json({ message: '✏️ 員工資料修改成功！', data: updatedUser });
});

exports.deleteEmployee = catchAsync(async (req, res) => {
    const id = parseInt(req.params.id);

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
        const error = new Error('找不到這位員工。');
        error.statusCode = 404;
        throw error;
    }
    if (target.id === req.user.id) {
        const error = new Error('不能刪除自己目前登入的帳號。');
        error.statusCode = 400;
        throw error;
    }
    // 打卡紀錄、手機登記會一併刪除（資料表設定為連動刪除）
    await prisma.user.delete({ where: { id } });
    res.json({ message: `🗑️ 已刪除「${target.name}」及其所有紀錄` });
});
