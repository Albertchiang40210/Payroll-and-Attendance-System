require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    logger.info(`🚀 打卡薪資系統已成功啟動：http://localhost:${PORT}`);
    logger.info(`📑 API 文件：http://localhost:${PORT}/api-docs`);
});
