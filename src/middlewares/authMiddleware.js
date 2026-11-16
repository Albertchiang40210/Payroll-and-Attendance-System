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

// 員工手機驗證：token 需對應一支「已登記且未被解除」的裝置，並綁定到一位在職員工
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
    if (!token) throw unauthorized('此手機尚未登記，請向店長索取登記 QR Code。');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.kiosk !== true || typeof decoded.did !== 'number') {
        throw unauthorized('此手機尚未登記，請向店長索取登記 QR Code。');
    }

    const device = await prisma.device.findUnique({
        where: { id: decoded.did },
        include: { user: { select: { id: true, name: true, punch: true, active: true } } }
    });
    if (!device) throw unauthorized('此手機的登記已被解除，請向店長重新索取登記 QR Code。');
    if (!device.user.punch || !device.user.active) {
        throw unauthorized('這個帳號已停用，如有疑問請洽店長。');
    }

    req.kioskUser = { id: device.user.id, name: device.user.name };
    next();
});
