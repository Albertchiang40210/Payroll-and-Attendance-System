const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const { createUserSchema } = require('../validations/userValidation');

// Protect all routes after this middleware
router.use(protect);
router.use(restrictTo('ADMIN'));

router.get('/', employeeController.getAllEmployees);
router.post('/', validateRequest(createUserSchema), employeeController.createEmployee);
router.put('/:id', employeeController.updateEmployee);
router.delete('/:id', employeeController.deleteEmployee);

module.exports = router;
