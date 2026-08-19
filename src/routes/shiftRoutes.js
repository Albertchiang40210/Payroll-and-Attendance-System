const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', shiftController.getShifts); // Anyone can view shifts
router.post('/', restrictTo('ADMIN'), shiftController.createShift); // Only admin can create

module.exports = router;
