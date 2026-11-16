const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// 健康檢查：確認網站與資料庫都正常。不需登入，也不回傳任何資料內容。
router.get('/', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ ok: true });
    } catch (err) {
        res.status(503).json({ ok: false });
    }
});

module.exports = router;
