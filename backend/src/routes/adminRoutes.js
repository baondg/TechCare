const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
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

router.get('/dashboard-summary', adminController.getDashboardSummary);
router.get('/departments', adminController.listDepartments);
router.get('/accounts', adminController.getAccounts);
router.post('/accounts', adminController.createAccount);
router.patch('/accounts/:id', adminController.updateAccount);
router.patch('/accounts/:id/status', adminController.updateAccountStatus);
router.get('/feedbacks', adminController.getFeedbacks);
router.patch('/feedbacks/:id', adminController.updateFeedback);

module.exports = router;

