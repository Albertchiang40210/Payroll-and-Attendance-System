const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const kioskController = require('../controllers/kioskController');
const { protect, restrictTo, kioskProtect } = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const { pairSchema, recordsSchema, kioskClockSchema, createQrSchema } = require('../validations/kioskValidation');

// 防止暴力猜通行碼
const pairLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.PAIR_RATE_LIMIT_MAX) || 10,
    message: { status: 'fail', message: '嘗試次數過多，請於 15 分鐘後再試。' }
});

// 防止連續狂按
const clockLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { status: 'fail', message: '操作太頻繁，請稍後再試。' }
});

// 員工手機
router.post('/pair', pairLimiter, validateRequest(pairSchema), kioskController.pair);
router.get('/employees', kioskProtect, kioskController.listEmployees);
router.get('/records', kioskProtect, validateRequest(recordsSchema), kioskController.records);
router.post('/clock', kioskProtect, clockLimiter, validateRequest(kioskClockSchema), kioskController.clock);

// 老闆後台
router.get('/qr', protect, restrictTo('ADMIN'), kioskController.getQr);
router.post('/qr', protect, restrictTo('ADMIN'), validateRequest(createQrSchema), kioskController.createQr);
router.post('/revoke-all', protect, restrictTo('ADMIN'), kioskController.revokeAllDevices);

module.exports = router;
