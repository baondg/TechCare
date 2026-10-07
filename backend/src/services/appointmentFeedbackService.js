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

/** New feedback (content / rating 1–5 checked by the route validator); returns it as listed. */
async function create({ userId, body }) {
  const insertId = await appointmentFeedbackRepository.insertFeedbackRow({
    userId,
    content: String(body.content).trim(),
    type: String(body.type || 'general').trim(),
    rating: Number(body.rating),
  });
  return mapPatientFeedbackRow(await appointmentFeedbackRepository.selectFeedbackById(insertId));
}

module.exports = {
  listForUser,
  listVisible,
  create,
};
