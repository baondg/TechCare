const { BadRequestError } = require('../errors/AppError');

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
    throw new BadRequestError('date query param required');
  }
}

/** POST / (create appointment) */
function createAppointmentBody(req) {
  const { doctor, department, date, time, doctorId: doctorIdBody } = req.body || {};
  const doctorPk = Number(doctorIdBody);
  const useDoctorPk = Number.isFinite(doctorPk) && doctorPk > 0;
  if ((!doctor && !useDoctorPk) || !department || !date || !time) {
    throw new BadRequestError('Missing required fields');
  }
}

/** PUT /:id, DELETE /:id */
function appointmentIdParam(req) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    throw new BadRequestError('Invalid id');
  }
}

/** DELETE /:id */
function deleteAppointmentBody(req) {
  const reason = String(req.body?.cancellationReason ?? req.body?.reason ?? '').trim();
  if (!reason) {
    throw new BadRequestError('Cancellation reason is required');
  }
}

/** POST /open-slots */
function createOpenSlotBody(req) {
  const doctorId = Number(req.body?.doctorId);
  const date = String(req.body?.date || '').trim();
  const time = String(req.body?.time || '').trim().slice(0, 5);
  if (!Number.isFinite(doctorId) || !date || !time) {
    throw new BadRequestError('doctorId, date and time are required');
  }
}

/** PUT/DELETE /open-slots/:id */
function openSlotIdParam(req) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    throw new BadRequestError('Invalid id');
  }
}

/** GET /open-slots — dates optional; if present must be YYYY-MM-DD */
function openSlotsQuery(req) {
  const startDate = String(req.query?.startDate ?? '').trim();
  const endDate = String(req.query?.endDate ?? '').trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (startDate && !dateRe.test(startDate)) {
    throw new BadRequestError('startDate must be YYYY-MM-DD');
  }
  if (endDate && !dateRe.test(endDate)) {
    throw new BadRequestError('endDate must be YYYY-MM-DD');
  }
}

/** GET /lab-tests/:testId/details */
function labTestIdParam(req) {
  const testId = Number(req.params.testId);
  if (!Number.isFinite(testId) || testId <= 0) {
    throw new BadRequestError('Invalid test id');
  }
}

/** POST /feedback */
function createFeedbackBody(req) {
  const content = String(req.body?.content || '').trim();
  const rating = Number(req.body?.rating);
  if (!content) {
    throw new BadRequestError('Feedback content is required');
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new BadRequestError('Rating must be between 1 and 5');
  }
}

/** PATCH /ai-recommendations/:id/feedback */
function patchAiRecommendationFeedbackBody(req) {
  const feedback = String(req.body?.feedback || '').trim();
  if (!feedback) {
    throw new BadRequestError('Feedback is required');
  }
}

/** POST /ai/chat */
function aiChatBody(req) {
  const userMessage = String(req.body?.userMessage || '').trim();
  if (!userMessage) {
    throw new BadRequestError('userMessage is required');
  }
  if (req.body?.messages != null && !Array.isArray(req.body.messages)) {
    throw new BadRequestError('messages must be an array');
  }
}

const {
  normalizeSymptomsForAi,
  normalizeSymptomText,
  SYMPTOM_SEVERITY_VALUES,
  SYMPTOM_DURATION_VALUES,
  MIN_CUSTOM_SYMPTOM_LENGTH,
} = require('../lib/symptomNormalize');

/** POST /ai/symptom-analysis */
function aiSymptomAnalysisBody(req) {
  const symptoms = req.body?.symptoms;
  if (!Array.isArray(symptoms) || symptoms.length === 0) {
    throw new BadRequestError('symptoms is required');
  }
  for (let i = 0; i < symptoms.length; i++) {
    const item = symptoms[i];
    if (!item || typeof item !== 'object') {
      throw new BadRequestError(`symptoms[${i}] must be an object`);
    }
    const name = normalizeSymptomText(item.name);
    if (!name || name.length < MIN_CUSTOM_SYMPTOM_LENGTH) {
      throw new BadRequestError(`symptoms[${i}].name is required`);
    }
    const severity = String(item.severity || '').trim();
    if (!SYMPTOM_SEVERITY_VALUES.has(severity)) {
      throw new BadRequestError(`symptoms[${i}].severity must be mild, moderate, or severe`);
    }
    const duration = String(item.duration || '').trim();
    if (!SYMPTOM_DURATION_VALUES.has(duration)) {
      throw new BadRequestError(`symptoms[${i}].duration is invalid`);
    }
  }
  if (normalizeSymptomsForAi(symptoms).length === 0) {
    throw new BadRequestError('No valid symptoms after normalization');
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
  throw new BadRequestError('refresh must be 1, 0, true, or false');
}

/** GET /nurse/check-in-options */
function nurseCheckInOptionsQuery(req) {
  const n = parseNursePatientNum(req.query?.patientId);
  if (!n) {
    throw new BadRequestError('patientId is required');
  }
  const pk = req.query?.patientPk;
  if (pk != null && pk !== '') {
    const pkn = Number(pk);
    if (!Number.isFinite(pkn) || pkn <= 0) throw new BadRequestError('patientPk must be a positive number');
  }
  const appt = req.query?.appointmentId;
  if (appt != null && appt !== '') {
    const apptN = Number(appt);
    if (!Number.isFinite(apptN) || apptN <= 0) throw new BadRequestError('appointmentId must be a positive number');
  }
}

/** POST /nurse/check-in-accept */
function nurseCheckInAcceptBody(req) {
  const n = parseNursePatientNum(req.body?.patientId);
  const appointmentId = Number(req.body?.appointmentId);
  if (!n || !Number.isFinite(appointmentId)) {
    throw new BadRequestError('patientId and appointmentId are required');
  }
}

/** POST /nurse/check-in-assign */
function nurseCheckInAssignBody(req) {
  const n = parseNursePatientNum(req.body?.patientId);
  const appointmentId = Number(req.body?.appointmentId);
  if (!n || !Number.isFinite(appointmentId)) {
    throw new BadRequestError('patientId and appointmentId are required');
  }
}

/** POST /nurse/check-in-reschedule */
function nurseCheckInRescheduleBody(req) {
  const n = parseNursePatientNum(req.body?.patientId);
  const fromAppointmentId = Number(req.body?.fromAppointmentId);
  const toAppointmentId = Number(req.body?.toAppointmentId);
  if (!n || !Number.isFinite(fromAppointmentId) || !Number.isFinite(toAppointmentId)) {
    throw new BadRequestError('patientId, fromAppointmentId and toAppointmentId are required');
  }
  if (fromAppointmentId === toAppointmentId) {
    throw new BadRequestError('Cannot reschedule to the same slot');
  }
}

/** POST /nurse/regimen/checkout */
function nurseRegimenCheckoutBody(req) {
  const n = parseNursePatientNum(req.body?.patientId);
  const regimenId = Number(req.body?.regimenId);
  if (!n || !Number.isFinite(regimenId)) {
    throw new BadRequestError('patientId and regimenId are required');
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
