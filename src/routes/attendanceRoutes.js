const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const { clockSchema } = require('../validations/userValidation');

router.use(protect);

router.post('/', validateRequest(clockSchema), attendanceController.clockInOut);

// Only admins can see everyone's today attendance (or you could allow everyone, but let's restrict to ADMIN for now)
router.get('/today', restrictTo('ADMIN'), attendanceController.getTodayAttendance);

module.exports = router;
