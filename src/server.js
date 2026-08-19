require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`🚀 打卡薪資系統已成功啟動：http://localhost:${PORT}`);
    console.log(`📑 班上第一名專屬測試大門：http://localhost:${PORT}/api-docs`);
});
