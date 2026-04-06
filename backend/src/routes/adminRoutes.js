const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authenticateToken = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.get('/dashboard-summary', adminController.getDashboardSummary);
router.get('/departments', adminController.listDepartments);
router.get('/accounts', adminController.getAccounts);
router.post('/accounts', adminController.createAccount);
router.patch('/accounts/:id', adminController.updateAccount);
router.patch('/accounts/:id/status', adminController.updateAccountStatus);
router.get('/feedbacks', adminController.getFeedbacks);
router.patch('/feedbacks/:id', adminController.updateFeedback);

module.exports = router;

