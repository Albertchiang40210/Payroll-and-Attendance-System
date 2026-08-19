const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const validateRequest = require('../middlewares/validateRequest');
const { loginSchema } = require('../validations/userValidation');

router.post('/login', validateRequest(loginSchema), authController.login);

module.exports = router;
