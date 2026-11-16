require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');
const prisma = require('./utils/prisma');

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
    logger.info(`🚀 打卡薪資系統已成功啟動：http://localhost:${PORT}`);
    logger.info(`📑 API 文件：http://localhost:${PORT}/api-docs`);
});

// 收到停止訊號（docker stop / 重新部署）時，先處理完進行中的請求，再關閉資料庫連線
const shutdown = (signal) => {
    logger.info(`收到 ${signal}，正在關閉服務…`);
    server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
};
['SIGTERM', 'SIGINT'].forEach((s) => process.on(s, () => shutdown(s)));
