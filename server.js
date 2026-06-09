const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

// ==========================================
// 🚀 【班上第一名外掛】注入 Swagger 模組
// ==========================================
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 資料庫連線設定 (已寫入您的密碼：P@ssw0rd)
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'P@ssw0rd', 
    database: 'punch_db',
    waitForConnections: true,
    connectionLimit: 10
});

// ==========================================
// 🛠️ Swagger 規格書基本設定
// ==========================================
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: '🏮 點心店員工打卡及薪資系統 API',
            version: '1.0.0',
            description: '資展全班第一名！採用 Node.js Express 打造的高效能前後端分離中央廚房。',
        },
        servers: [
            {
                url: 'http://localhost:3001',
                description: '本地開發伺服器',
            },
        ],
    },
    apis: ['./server.js'], // 指向自己這個檔案來解析註解
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
// 開放一個 /api-docs 的專屬後端測試大門網址
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));


// ==========================================
// 🛣️ API 路由區段 (附帶 Swagger 規格文件註解)
// ==========================================

/**
 * @openapi
 * /api/employees:
 *   get:
 *     summary: 取得所有員工列表
 *     tags: [員工管理]
 *     responses:
 *       200:
 *         description: 成功取得所有員工的基本資料與時薪
 */
app.get('/api/employees', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT emp_id, name, CAST(hourly_rate AS UNSIGNED) as hourly_rate FROM employees');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/clock:
 *   post:
 *     summary: 員工上下班打卡功能 (內建重複打卡防呆)
 *     tags: [出勤管理]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - emp_id
 *               - type
 *             properties:
 *               emp_id:
 *                 type: integer
 *                 example: 1
 *               type:
 *                 type: string
 *                 enum: [in, out]
 *                 example: in
 *     responses:
 *       200:
 *         description: 打卡成功
 *       400:
 *         description: 資料不完整、今日已打過卡、或未打上班卡就嘗試打下班卡
 *       500:
 *         description: 資料庫錯誤
 */
app.post('/api/clock', async (req, res) => {
    const { emp_id, type } = req.body; 
    if (!emp_id || !type) return res.status(400).json({ message: '資料不完整' });

    const now = new Date();
    const twTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); 
    const today = twTime.toISOString().slice(0, 10); 
    const timeString = twTime.toISOString().slice(11, 19); 

    try {
        const [rows] = await pool.query(
            'SELECT * FROM attendance WHERE emp_id = ? AND work_date = ?', 
            [emp_id, today]
        );

        if (type === 'in') {
            if (rows.length > 0) {
                return res.status(400).json({ message: `❌ 您今天已經打過上班卡囉！` });
            }
            await pool.query(
                'INSERT INTO attendance (emp_id, work_date, clock_in) VALUES (?, ?, ?)',
                [emp_id, today, now]
            );
            return res.json({ status: 'success', time: timeString, message: `☀️ 上班打卡成功！\n時間：${timeString}` });

        } else if (type === 'out') {
            if (rows.length === 0) {
                return res.status(400).json({ message: '❌ 您今日尚未有上班打卡紀錄，請先打上班卡！' });
            }
            if (rows[0].clock_out !== null) {
                return res.status(400).json({ message: `❌ 您今天已經打過下班卡囉！` });
            }
            await pool.query(
                'UPDATE attendance SET clock_out = ? WHERE emp_id = ? AND work_date = ?',
                [now, emp_id, today]
            );
            return res.json({ status: 'success', time: timeString, message: `🌙 下班打卡成功！\n時間：${timeString}` });
        }
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

/**
 * @openapi
 * /api/attendance/today:
 *   get:
 *     summary: 取得今日所有員工的出勤流水帳 (即時動態)
 *     tags: [出勤管理]
 *     responses:
 *       200:
 *         description: 成功取得今日出勤報表
 */
app.get('/api/attendance/today', async (req, res) => {
    const now = new Date();
    const twTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); 
    const today = twTime.toISOString().slice(0, 10); 

    try {
        const querySQL = `
            SELECT 
                e.name,
                DATE_FORMAT(a.clock_in, '%H:%i:%s') AS log_in,
                DATE_FORMAT(a.clock_out, '%H:%i:%s') AS log_out
            FROM attendance a
            JOIN employees e ON a.emp_id = e.emp_id
            WHERE a.work_date = ?
            ORDER BY a.clock_in DESC
        `;
        const [rows] = await pool.query(querySQL, [today]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @openapi
 * /api/salary:
 *   get:
 *     summary: 整月份薪資自動結算 + 詳細出勤紀錄查詢
 *     tags: [薪資結算]
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *         description: 欲查詢的月份，格式範例：2026-06
 *         example: 2026-06
 *     responses:
 *       200:
 *         description: 成功取得該月薪資加總摘要及每日出勤時數明細
 */
app.get('/api/salary', async (req, res) => {
    const { month } = req.query; 
    if (!month) return res.status(400).json({ message: '請提供查詢月份' });

    try {
        const salarySQL = `
            SELECT 
                e.emp_id, e.name, e.hourly_rate,
                ROUND(SUM(TIMESTAMPDIFF(MINUTE, a.clock_in, a.clock_out)) / 60, 2) AS total_hours,
                ROUND(SUM(TIMESTAMPDIFF(MINUTE, a.clock_in, a.clock_out)) / 60 * e.hourly_rate, 0) AS total_salary
            FROM employees e
            JOIN attendance a ON e.emp_id = a.emp_id
            WHERE a.work_date LIKE ? AND a.clock_out IS NOT NULL
            GROUP BY e.emp_id
        `;
        const [summaryRows] = await pool.query(salarySQL, [`${month}%`]);

        const detailSQL = `
            SELECT 
                a.work_date, e.name,
                DATE_FORMAT(a.clock_in, '%H:%i:%s') AS log_in,
                DATE_FORMAT(a.clock_out, '%H:%i:%s') AS log_out,
                ROUND(TIMESTAMPDIFF(MINUTE, a.clock_in, a.clock_out) / 60, 2) AS day_hours
            FROM attendance a
            JOIN employees e ON a.emp_id = e.emp_id
            WHERE a.work_date LIKE ?
            ORDER BY a.work_date DESC, a.clock_in DESC
        `;
        const [detailRows] = await pool.query(detailSQL, [`${month}%`]);

        res.json({ summary: summaryRows, details: detailRows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @openapi
 * /api/employees:
 *   post:
 *     summary: 人事管理：新增員工資料
 *     tags: [員工管理]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - hourly_rate
 *             properties:
 *               name:
 *                 type: string
 *                 example: 王小明
 *               hourly_rate:
 *                 type: integer
 *                 example: 190
 *     responses:
 *       200:
 *         description: 成功新增員工
 */
app.post('/api/employees', async (req, res) => {
    const { name, hourly_rate } = req.body;
    try {
        await pool.query('INSERT INTO employees (name, hourly_rate, role) VALUES (?, ?, "staff")', [name, hourly_rate]);
        res.json({ message: `🎉 成功新增員工：${name}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @openapi
 * /api/employees/{id}:
 *   put:
 *     summary: 人事管理：修改員工姓名或時薪
 *     tags: [員工管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 員工的 emp_id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: 王大明
 *               hourly_rate:
 *                 type: integer
 *                 example: 200
 *     responses:
 *       200:
 *         description: 員工資料修改成功
 */
app.put('/api/employees/:id', async (req, res) => {
    const { id } = req.params; const { name, hourly_rate } = req.body;
    try {
        await pool.query('UPDATE employees SET name = ?, hourly_rate = ? WHERE emp_id = ?', [name, hourly_rate, id]);
        res.json({ message: '✏️ 員工資料修改成功！' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * @openapi
 * /api/employees/{id}:
 *   delete:
 *     summary: 人事管理：刪除員工資料
 *     tags: [員工管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 員工的 emp_id
 *     responses:
 *       200:
 *         description: 員工已成功刪除
 */
app.delete('/api/employees/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM employees WHERE emp_id = ?', [id]);
        res.json({ message: '🗑️ 員工已成功刪除' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(3001, () => {
    console.log('🚀 打卡薪資系統已成功啟動：http://localhost:3001');
    console.log('📑 班上第一名專屬測試大門：http://localhost:3001/api-docs');
});