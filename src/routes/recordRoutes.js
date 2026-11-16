const express = require('express');
const router = express.Router();
const recordController = require('../controllers/recordController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const {
    monthQuerySchema, createRecordSchema, updateRecordSchema, deleteRecordSchema
} = require('../validations/recordValidation');

// 補打卡 / 修改 / 刪除出勤紀錄：僅老闆
router.use(protect);
router.use(restrictTo('ADMIN'));

router.get('/', validateRequest(monthQuerySchema), recordController.listMonth);
router.post('/', validateRequest(createRecordSchema), recordController.create);
router.put('/:id', validateRequest(updateRecordSchema), recordController.update);
router.delete('/:id', validateRequest(deleteRecordSchema), recordController.remove);

module.exports = router;
