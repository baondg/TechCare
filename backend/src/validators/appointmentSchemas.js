function throwHttp(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  throw e;
}

function parseNursePatientNum(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(/^OP0*/i, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function compose(...fns) {
  return (req) => {
    for (const f of fns) f(req);
  };
}

/** GET /booked-slots */
function bookedSlotsQuery(req) {
  const date = req.query?.date;
  if (!date || String(date).trim() === '') {
    throwHttp(400, 'date query param required');
  }
}

/** POST / (create appointment) */
function createAppointmentBody(req) {
  const { doctor, department, date, time, doctorId: doctorIdBody } = req.body || {};
  const doctorPk = Number(doctorIdBody);
  const useDoctorPk = Number.isFinite(doctorPk) && doctorPk > 0;
  if ((!doctor && !useDoctorPk) || !department || !date || !time) {
    throwHttp(400, 'Missing required fields');
  }
}

/** PUT /:id, DELETE /:id */
function appointmentIdParam(req) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    throwHttp(400, 'Invalid id');
  }
}

/** DELETE /:id */
function deleteAppointmentBody(req) {
  const reason = String(req.body?.cancellationReason ?? req.body?.reason ?? '').trim();
  if (!reason) {
    throwHttp(400, 'Cancellation reason is required');
  }
}

/** POST /open-slots */
function createOpenSlotBody(req) {
  const doctorId = Number(req.body?.doctorId);
  const date = String(req.body?.date || '').trim();
  const time = String(req.body?.time || '').trim().slice(0, 5);
  if (!Number.isFinite(doctorId) || !date || !time) {
    throwHttp(400, 'doctorId, date and time are required');
  }
}

/** PUT/DELETE /open-slots/:id */
function openSlotIdParam(req) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    throwHttp(400, 'Invalid id');
  }
}

/** GET /open-slots — dates optional; if present must be YYYY-MM-DD */
function openSlotsQuery(req) {
  const startDate = String(req.query?.startDate ?? '').trim();
  const endDate = String(req.query?.endDate ?? '').trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (startDate && !dateRe.test(startDate)) {
    throwHttp(400, 'startDate must be YYYY-MM-DD');
  }
  if (endDate && !dateRe.test(endDate)) {
    throwHttp(400, 'endDate must be YYYY-MM-DD');
  }
}

/** GET /lab-tests/:testId/details */
function labTestIdParam(req) {
  const testId = Number(req.params.testId);
  if (!Number.isFinite(testId) || testId <= 0) {
    throwHttp(400, 'Invalid test id');
  }
}

/** POST /feedback */
function createFeedbackBody(req) {
  const content = String(req.body?.content || '').trim();
  const rating = Number(req.body?.rating);
  if (!content) {
    throwHttp(400, 'Feedback content is required');
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throwHttp(400, 'Rating must be between 1 and 5');
  }
}

/** PATCH /ai-recommendations/:id/feedback */
function patchAiRecommendationFeedbackBody(req) {
  const feedback = String(req.body?.feedback || '').trim();
  if (!feedback) {
    throwHttp(400, 'Feedback is required');
  }
}

/** POST /ai/chat */
function aiChatBody(req) {
  const userMessage = String(req.body?.userMessage || '').trim();
  if (!userMessage) {
    throwHttp(400, 'userMessage is required');
  }
  if (req.body?.messages != null && !Array.isArray(req.body.messages)) {
    throwHttp(400, 'messages must be an array');
  }
}

/** POST /ai/symptom-analysis */
function aiSymptomAnalysisBody(req) {
  const symptoms = req.body?.symptoms;
  if (!Array.isArray(symptoms) || symptoms.length === 0) {
    throwHttp(400, 'symptoms is required');
  }
}

/** GET /ai/recovery-prediction (and staff GET …/recovery-prediction) — optional refresh */
function recoveryPredictionQuery(req) {
  const raw = req.query?.refresh;
  if (raw === undefined || raw === null) return;
  const s = String(raw).trim();
  if (s === '') return;
  const low = s.toLowerCase();
  if (['1', '0', 'true', 'false'].includes(low)) return;
  throwHttp(400, 'refresh must be 1, 0, true, or false');
}

/** GET /nurse/check-in-options */
function nurseCheckInOptionsQuery(req) {
  const n = parseNursePatientNum(req.query?.patientId);
  if (!n) {
    throwHttp(400, 'patientId is required');
  }
}

/** POST /nurse/check-in-accept */
function nurseCheckInAcceptBody(req) {
  const n = parseNursePatientNum(req.body?.patientId);
  const appointmentId = Number(req.body?.appointmentId);
  if (!n || !Number.isFinite(appointmentId)) {
    throwHttp(400, 'patientId and appointmentId are required');
  }
}

/** POST /nurse/check-in-assign */
function nurseCheckInAssignBody(req) {
  const n = parseNursePatientNum(req.body?.patientId);
  const appointmentId = Number(req.body?.appointmentId);
  if (!n || !Number.isFinite(appointmentId)) {
    throwHttp(400, 'patientId and appointmentId are required');
  }
}

/** POST /nurse/check-in-reschedule */
function nurseCheckInRescheduleBody(req) {
  const n = parseNursePatientNum(req.body?.patientId);
  const fromAppointmentId = Number(req.body?.fromAppointmentId);
  const toAppointmentId = Number(req.body?.toAppointmentId);
  if (!n || !Number.isFinite(fromAppointmentId) || !Number.isFinite(toAppointmentId)) {
    throwHttp(400, 'patientId, fromAppointmentId and toAppointmentId are required');
  }
  if (fromAppointmentId === toAppointmentId) {
    throwHttp(400, 'Cannot reschedule to the same slot');
  }
}

/** POST /nurse/regimen/checkout */
function nurseRegimenCheckoutBody(req) {
  const n = parseNursePatientNum(req.body?.patientId);
  const regimenId = Number(req.body?.regimenId);
  if (!n || !Number.isFinite(regimenId)) {
    throwHttp(400, 'patientId and regimenId are required');
  }
}

module.exports = {
  compose,
  bookedSlotsQuery,
  createAppointmentBody,
  appointmentIdParam,
  deleteAppointmentBody,
  createOpenSlotBody,
  openSlotIdParam,
  openSlotsQuery,
  labTestIdParam,
  createFeedbackBody,
  patchAiRecommendationFeedbackBody,
  aiChatBody,
  aiSymptomAnalysisBody,
  recoveryPredictionQuery,
  nurseCheckInOptionsQuery,
  nurseCheckInAcceptBody,
  nurseCheckInAssignBody,
  nurseCheckInRescheduleBody,
  nurseRegimenCheckoutBody,
};
