const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/admin/dashboardController');
const accountController = require('../controllers/admin/accountController');
const feedbackController = require('../controllers/admin/feedbackController');
const authenticateToken = require('../middleware/authMiddleware');
const { normalizeRoleFromCode } = require('../security/roleMapping');

const requireAdmin = (req, res, next) => {
  if (!req.user || normalizeRoleFromCode(req.user.role) !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  return next();
};

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/dashboard-summary', adminDashboardController.getDashboardSummary);
router.get('/departments', accountController.listDepartments);
router.get('/accounts', accountController.getAccounts);
router.post('/accounts', accountController.createAccount);
router.patch('/accounts/:id', accountController.updateAccount);
router.patch('/accounts/:id/status', accountController.updateAccountStatus);
router.get('/feedbacks', feedbackController.getFeedbacks);
router.patch('/feedbacks/:id', feedbackController.updateFeedback);

module.exports = router;

