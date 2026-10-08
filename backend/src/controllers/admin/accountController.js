const accountService = require('../../services/admin/accountService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/admin/departments */
exports.listDepartments = asyncHandler(async (req, res) => {
  res.json({ success: true, departments: await accountService.listDepartments() });
});

/** GET /api/admin/accounts — query validated by `listAccountsQuery`. */
exports.getAccounts = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await accountService.listAccounts(req.query)) });
});

/** POST /api/admin/accounts — `temporaryPassword` is in this response only. */
exports.createAccount = asyncHandler(async (req, res) => {
  const { account, temporaryPassword } = await accountService.createAccount(req.body, req.user?.userId);
  res.status(201).json({ success: true, account, temporaryPassword });
});

/** POST /api/admin/accounts/:id/reset-password — `temporaryPassword` is in this response only. */
exports.resetPassword = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await accountService.resetPassword(req.params.id, req.user?.userId)) });
});

/** PATCH /api/admin/accounts/:id — profile fields; username and role are read-only. */
exports.updateAccount = asyncHandler(async (req, res) => {
  res.json({ success: true, account: await accountService.updateAccount(req.params.id, req.body) });
});

/** PATCH /api/admin/accounts/:id/status — `{ status: boolean }` */
exports.updateAccountStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await accountService.setAccountEnabled(req.params.id, req.body?.status)) });
});
