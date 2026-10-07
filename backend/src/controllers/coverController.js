const coverService = require('../services/coverService');
const { asyncHandler } = require('../common/asyncHandler');

/** Services answer { status, json }; unexpected errors propagate to middleware/errorHandler. */
const send = (res, out) => res.status(out.status).json(out.json);

exports.createCoverRequest = asyncHandler(async (req, res) => {
  send(res, await coverService.createCoverRequest(req.user.userId, req.body));
});

exports.getCoverRequests = asyncHandler(async (req, res) => {
  send(res, await coverService.getCoverRequests(req.user.userId));
});

exports.getMyCoverRequests = asyncHandler(async (req, res) => {
  send(res, await coverService.getMyCoverRequests(req.user.userId));
});

exports.acceptCoverRequest = asyncHandler(async (req, res) => {
  send(res, await coverService.acceptCoverRequest(req.user.userId, req.params.id));
});

exports.rejectCoverRequest = asyncHandler(async (req, res) => {
  send(res, await coverService.rejectCoverRequest(req.user.userId, req.params.id));
});
