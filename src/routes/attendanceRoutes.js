const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const { clockSchema } = require('../validations/userValidation');
const { dayQuerySchema } = require('../validations/recordValidation');

router.use(protect);

router.post('/', validateRequest(clockSchema), attendanceController.clockInOut);

// 登入者自己最近的打卡紀錄
router.get('/my-records', attendanceController.getMyRecords);

// 老闆：查詢指定日期的出勤
router.get('/day', restrictTo('ADMIN'), validateRequest(dayQuerySchema), attendanceController.getDayAttendance);

// Only admins can see everyone's today attendance
router.get('/today', restrictTo('ADMIN'), attendanceController.getTodayAttendance);

module.exports = router;
