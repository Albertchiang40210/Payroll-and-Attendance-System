const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const { leaveSchema, leaveStatusSchema } = require('../validations/userValidation');

router.use(protect);

router.post('/', validateRequest(leaveSchema), leaveController.createLeave); // Any authenticated user
router.get('/', restrictTo('ADMIN'), leaveController.getAllLeaves); // Only admin
router.put('/:id/status', restrictTo('ADMIN'), validateRequest(leaveStatusSchema), leaveController.updateLeaveStatus); // Only admin

module.exports = router;
