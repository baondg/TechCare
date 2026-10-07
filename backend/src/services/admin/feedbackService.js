const adminFeedbackRepository = require('../../repositories/adminFeedbackRepository');
const { NotFoundError } = require('../../errors/AppError');
const { ACCOUNT_ROLE_LABEL } = require('./roleLabels');

function mapFeedbackRow(r) {
  const fullName = String(r.userName || '').trim();
  return {
    id: Number(r.id),
    userId: Number(r.userId),
    username: r.username || '',
    userName: fullName || r.username || `User #${r.userId}`,
    roleCode: r.roleCode || '',
    role: ACCOUNT_ROLE_LABEL[r.roleCode] || r.roleCode || 'Unknown',
    type: r.type || 'general',
    content: r.content || '',
    rating: Number(r.rating || 0),
    time: r.time || null,
    status: r.status === 1 || r.status === true || r.status === '1',
    response: r.response || '',
  };
}

async function listFeedbacks() {
  const rows = await adminFeedbackRepository.listFeedbacksWithAuthor();
  return (rows || []).map(mapFeedbackRow);
}

/**
 * Admin reply / handled flag. Only the keys present in `body` change: a blank `response`
 * clears it, `status` is truthy → handled.
 */
async function updateFeedback(id, body) {
  const changes = {};
  if ('response' in body) changes.response = String(body.response || '').trim() || null;
  if ('status' in body) changes.status = body.status ? 1 : 0;

  if (!(await adminFeedbackRepository.feedbackExists(id))) {
    throw new NotFoundError('Feedback not found');
  }
  await adminFeedbackRepository.updateFeedback(id, changes);
  return mapFeedbackRow(await adminFeedbackRepository.findFeedbackWithAuthor(id));
}

module.exports = { listFeedbacks, updateFeedback };
