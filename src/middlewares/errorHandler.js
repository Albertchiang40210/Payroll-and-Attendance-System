const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger.error(err);
    
    // JWT 無效或過期 → 401（讓前端能判斷登入失效）
    if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(err.name)) {
        err.statusCode = 401;
        err.message = '登入已失效，請重新登入。';
    }

    // Check if it's a known operational error or unexpected
    const statusCode = err.statusCode || 500;
    const message = statusCode === 500 ? '伺服器內部發生錯誤，請稍後再試。' : err.message;

    res.status(statusCode).json({
        status: 'error',
        message: message,
        // In production, we don't send the full error stack to the client
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
