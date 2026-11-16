const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const { swaggerUi, swaggerSpec } = require('./config/swagger');
const errorHandler = require('./middlewares/errorHandler');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const salaryRoutes = require('./routes/salaryRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const shiftRoutes = require('./routes/shiftRoutes');
const kioskRoutes = require('./routes/kioskRoutes');
const recordRoutes = require('./routes/recordRoutes');

const app = express();

// 位於 Tailscale Funnel 之後，信任一層 proxy 才能取得真實用戶 IP（rate limit 需要）
app.set('trust proxy', 1);

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Swagger API Docs
// 正式環境預設關閉；需要時於 .env 設定 ENABLE_API_DOCS=true
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/clock', attendanceRoutes); // the controller handles clock in/out
app.use('/api/attendance', attendanceRoutes); // for /today
app.use('/api/salary', salaryRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/records', recordRoutes); // 老闆補打卡 / 修改紀錄
app.use('/api/kiosk', kioskRoutes); // 員工手機（選名字打卡）與 QR Code 管理

// 404 Handler
app.use((req, res, next) => {
    const error = new Error(`Can't find ${req.originalUrl} on this server!`);
    error.statusCode = 404;
    next(error);
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
