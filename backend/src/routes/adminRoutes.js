const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/admin/dashboardController');
const accountController = require('../controllers/admin/accountController');
const feedbackController = require('../controllers/admin/feedbackController');
const authenticateToken = require('../middleware/authMiddleware');
const { authorizeCapability } = require('../middleware/authorizeCapability');
const { validate } = require('../middleware/validate');
const {
  accountIdParams,
  feedbackIdParams,
  listAccountsQuery,
  updateFeedbackBody,
} = require('../validators/adminSchemas');

router.use(authenticateToken);
router.use(authorizeCapability('admin.console', { message: 'Admin access required' }));

router.get('/dashboard-summary', adminDashboardController.getDashboardSummary);
router.get('/departments', accountController.listDepartments);
router.get('/accounts', validate({ query: listAccountsQuery }), accountController.getAccounts);
router.post('/accounts', accountController.createAccount);
router.patch('/accounts/:id', validate({ params: accountIdParams }), accountController.updateAccount);
router.patch('/accounts/:id/status', validate({ params: accountIdParams }), accountController.updateAccountStatus);
router.get('/feedbacks', feedbackController.getFeedbacks);
router.patch(
  '/feedbacks/:id',
  validate({ params: feedbackIdParams, body: updateFeedbackBody }),
  feedbackController.updateFeedback
);

module.exports = router;

