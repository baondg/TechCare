const feedbackService = require('../../services/admin/feedbackService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/admin/feedbacks */
exports.getFeedbacks = asyncHandler(async (req, res) => {
  res.json({ success: true, feedbacks: await feedbackService.listFeedbacks() });
});

/** PATCH /api/admin/feedbacks/:id — body validated by `updateFeedbackBody`. */
exports.updateFeedback = asyncHandler(async (req, res) => {
  res.json({ success: true, feedback: await feedbackService.updateFeedback(req.params.id, req.body) });
});
