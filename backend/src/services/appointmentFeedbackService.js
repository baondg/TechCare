const appointmentFeedbackRepository = require('../repositories/appointmentFeedbackRepository');

function mapPatientFeedbackRow(r) {
  return {
    id: Number(r.id),
    userId: Number(r.userId || 0),
    content: r.content || '',
    type: r.type || 'general',
    time: r.time || null,
    status: r.status === 1 || r.status === true || r.status === '1',
    rating: Number(r.rating || 0),
    response: r.response || '',
    userName: r.userName || '',
  };
}

async function listForUser(userId) {
  const rows = await appointmentFeedbackRepository.listFeedbackForUser(userId);
  return { success: true, feedbacks: (rows || []).map(mapPatientFeedbackRow) };
}

async function listVisible() {
  const rows = await appointmentFeedbackRepository.listFeedbackVisibleApproved();
  return { success: true, feedbacks: (rows || []).map(mapPatientFeedbackRow) };
}

/**
 * @returns {{ status: number, json: object }}
 */
async function create({ userId, body }) {
  const content = String(body?.content || '').trim();
  const type = String(body?.type || 'general').trim();
  const rating = Number(body?.rating);

  if (!content) {
    return { status: 400, json: { success: false, message: 'Feedback content is required' } };
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { status: 400, json: { success: false, message: 'Rating must be between 1 and 5' } };
  }

  const insertId = await appointmentFeedbackRepository.insertFeedbackRow({
    userId,
    content,
    type,
    rating,
  });

  const created = await appointmentFeedbackRepository.selectFeedbackById(insertId);

  return {
    status: 201,
    json: { success: true, feedback: mapPatientFeedbackRow(created) },
  };
}

module.exports = {
  listForUser,
  listVisible,
  create,
};
