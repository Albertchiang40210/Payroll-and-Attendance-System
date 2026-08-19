const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const catchAsync = require('../utils/catchAsync');

exports.protect = catchAsync(async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
        const error = new Error('您尚未登入，請先登入以取得存取權限。');
        error.statusCode = 401;
        throw error;
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const currentUser = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!currentUser) {
        const error = new Error('該 token 所屬的使用者已不存在。');
        error.statusCode = 401;
        throw error;
    }
    
    req.user = currentUser;
    next();
});

exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            const error = new Error('您沒有權限執行此操作。');
            error.statusCode = 403;
            throw error;
        }
        next();
    };
};
