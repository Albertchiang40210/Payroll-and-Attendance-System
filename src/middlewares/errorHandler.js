const errorHandler = (err, req, res, next) => {
    console.error(`[Error]: ${err.message}`);
    
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
