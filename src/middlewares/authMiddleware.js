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

    // 店內裝置 token 沒有使用者 id，不能當作登入者使用
    if (typeof decoded.id !== 'number') {
        const error = new Error('登入已失效，請重新登入。');
        error.statusCode = 401;
        throw error;
    }
    
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

// 店內裝置驗證：token 需由「店內通行碼」換得，且版本與目前通行碼一致
exports.kioskProtect = catchAsync(async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    const unauthorized = (msg) => {
        const error = new Error(msg);
        error.statusCode = 401;
        return error;
    };
    if (!token) throw unauthorized('此裝置尚未登記，請輸入店內通行碼。');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.kiosk !== true) throw unauthorized('此裝置尚未登記，請輸入店內通行碼。');

    const row = await prisma.setting.findUnique({ where: { key: 'kiosk_version' } });
    const currentVersion = row ? Number(row.value) : 1;
    if (decoded.v !== currentVersion) throw unauthorized('通行碼已更新，請重新輸入店內通行碼。');

    next();
});
