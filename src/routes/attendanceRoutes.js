const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const { clockSchema } = require('../validations/userValidation');
const { aiRecognizeSchema } = require('../validations/aiValidation');

router.use(protect);

router.post('/', validateRequest(clockSchema), attendanceController.clockInOut);

// AI 面部辨識 API (Stub)
router.post('/ai-recognize', validateRequest(aiRecognizeSchema), attendanceController.aiRecognize);

// Only admins can see everyone's today attendance
router.get('/today', restrictTo('ADMIN'), attendanceController.getTodayAttendance);

module.exports = router;
