const express = require('express');
const router = express.Router();
const salaryController = require('../controllers/salaryController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

router.use(protect);
router.use(restrictTo('ADMIN'));

router.get('/', salaryController.getSalaryReport);
router.get('/export', salaryController.exportSalary);

module.exports = router;
