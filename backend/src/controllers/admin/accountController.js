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

/** POST /api/admin/accounts */
exports.createAccount = asyncHandler(async (req, res) => {
  const account = await accountService.createAccount(req.body, req.user?.userId);
  res.status(201).json({ success: true, account });
});

/** PATCH /api/admin/accounts/:id — profile fields; username and role are read-only. */
exports.updateAccount = asyncHandler(async (req, res) => {
  res.json({ success: true, account: await accountService.updateAccount(req.params.id, req.body) });
});

/** PATCH /api/admin/accounts/:id/status — `{ status: boolean }` */
exports.updateAccountStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await accountService.setAccountEnabled(req.params.id, req.body?.status)) });
});
