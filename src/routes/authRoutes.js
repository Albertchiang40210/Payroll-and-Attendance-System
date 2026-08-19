const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const validateRequest = require('../middlewares/validateRequest');
const { loginSchema } = require('../validations/userValidation');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per windowMs
    message: {
        status: 'fail',
        message: '嘗試登入次數過多，請於 15 分鐘後再試。'
    }
});

router.post('/login', loginLimiter, validateRequest(loginSchema), authController.login);

module.exports = router;
