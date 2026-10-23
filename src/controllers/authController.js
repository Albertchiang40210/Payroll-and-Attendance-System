const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync');

const signToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    });
};

exports.login = catchAsync(async (req, res) => {
    const { username, password } = req.body;

    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        const error = new Error('帳號或密碼錯誤');
        error.statusCode = 401;
        throw error;
    }

    const token = signToken(user.id);

    res.status(200).json({
        status: 'success',
        token,
        data: {
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
            },
        },
    });
});
