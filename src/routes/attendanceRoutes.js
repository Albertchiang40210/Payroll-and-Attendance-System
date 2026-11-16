const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const { clockSchema } = require('../validations/userValidation');
const { aiRecognizeSchema } = require('../validations/aiValidation');
const { dayQuerySchema } = require('../validations/recordValidation');

router.use(protect);

router.post('/', validateRequest(clockSchema), attendanceController.clockInOut);

// AI 面部辨識 API (Stub)
router.post('/ai-recognize', validateRequest(aiRecognizeSchema), attendanceController.aiRecognize);

// 登入者自己今天的打卡狀態
router.get('/my-today', attendanceController.getMyToday);
router.get('/my-records', attendanceController.getMyRecords);

// 老闆：查詢指定日期的出勤
router.get('/day', restrictTo('ADMIN'), validateRequest(dayQuerySchema), attendanceController.getDayAttendance);

// Only admins can see everyone's today attendance
router.get('/today', restrictTo('ADMIN'), attendanceController.getTodayAttendance);

module.exports = router;
