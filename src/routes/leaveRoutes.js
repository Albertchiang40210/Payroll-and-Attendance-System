const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

router.use(protect);

router.post('/', leaveController.createLeave); // Any authenticated user
router.get('/', restrictTo('ADMIN'), leaveController.getAllLeaves); // Only admin
router.put('/:id/status', restrictTo('ADMIN'), leaveController.updateLeaveStatus); // Only admin

module.exports = router;
