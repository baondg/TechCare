const appointmentPatientService = require('../services/appointmentPatientService');
const appointmentPatientPortalService = require('../services/appointmentPatientPortalService');
const appointmentSlotService = require('../services/appointmentSlotService');
const appointmentNurseService = require('../services/appointmentNurseService');
const appointmentCatalogService = require('../services/appointmentCatalogService');
const appointmentFeedbackService = require('../services/appointmentFeedbackService');
const appointmentAiService = require('../services/appointmentAiService');
const { asyncHandler } = require('../common/asyncHandler');
const { BadRequestError, NotFoundError } = require('../errors/AppError');

/**
 * Most appointment services answer `{ status, json }` (they decide 4xx themselves); a few return the
 * JSON body. Thrown errors go to errorHandler.
 */

/** Handler that sends `produce(req)`'s `{ status, json }` as is. */
const sendResult = (produce) =>
  asyncHandler(async (req, res) => {
    const { status, json } = await produce(req);
    res.status(status).json(json);
  });

/** Handler that sends `produce(req)` as a 200 JSON body. */
const sendJson = (produce) =>
  asyncHandler(async (req, res) => {
    res.json(await produce(req));
  });

/** `?refresh=1` / `?refresh=true` (any case). */
const wantsRefresh = (query) => ['1', 'true'].includes(String(query?.refresh || '').toLowerCase());

// ─── Feedback ───
exports.getFeedbacks = sendJson((req) => appointmentFeedbackService.listForUser(req.user.userId));
exports.getVisibleFeedbacks = sendJson(() => appointmentFeedbackService.listVisible());
exports.createFeedback = sendResult((req) => appointmentFeedbackService.create({ userId: req.user.userId, body: req.body }));

// ─── AI (patient) ───
exports.getAiRecommendations = sendJson((req) => appointmentAiService.getAiRecommendations(req.user.userId));
exports.updateAiRecommendationFeedback = sendResult((req) =>
  appointmentAiService.patchAiRecommendationFeedback(req.user.userId, req.params.id, req.body)
);
exports.chatWithAiAndSave = sendResult((req) => appointmentAiService.chatWithAiAndSave(req, req.user.userId, req.body));
exports.getAiChatModels = sendResult(() => appointmentAiService.listAiChatModels());
exports.analyzeSymptomsAndSave = sendResult((req) =>
  appointmentAiService.analyzeSymptomsAndSave(req, req.user.userId, req.body)
);

/** GET /api/appointments/ai/recovery-prediction — the signed-in patient's own prediction. */
exports.getRecoveryPrediction = sendResult(async (req) => {
  const patientId = await appointmentPatientService.getPatientPkForUserId(req.user.userId);
  if (!patientId) throw new NotFoundError('Patient profile not found');
  return appointmentAiService.recoveryPredictionForPatient(req, patientId, wantsRefresh(req.query));
});

/**
 * GET /api/doctor/patients/:patientId/recovery-prediction — same payload for EMR staff
 * (the doctor router already requires doctor.emr.read).
 */
exports.getStaffPatientRecoveryPrediction = sendResult(async (req) => {
  const routeId = Number(String(req.params.patientId || '').replace(/^OP0*/i, ''));
  if (!Number.isFinite(routeId) || routeId <= 0) throw new BadRequestError('Invalid patient id');
  const patientId = await appointmentPatientService.getPatientPkFromRouteId(routeId);
  if (!patientId) throw new NotFoundError('Patient not found');
  return appointmentAiService.recoveryPredictionForPatient(req, patientId, wantsRefresh(req.query));
});

// ─── Booking catalog (doctors with their departments, rooms, departments) ───
exports.getDoctors = sendResult(() => appointmentCatalogService.getDoctors());
exports.getClinicRooms = sendResult(() => appointmentCatalogService.getClinicRooms());
exports.getDepartments = sendResult(() => appointmentCatalogService.getDepartments());

// ─── Slots ───
/** GET /booked-slots?date=YYYY-MM-DD — booked (time, doctor) pairs of a day. */
exports.getBookedSlots = sendResult((req) => appointmentSlotService.getBookedSlots({ date: req.query.date }));
/** GET /open-slots?startDate=&endDate= — open and booked slots in a range. */
exports.getOpenSlots = sendResult((req) => appointmentSlotService.getOpenSlots({ role: req.user.role, query: req.query }));
exports.createOpenSlot = sendResult((req) => appointmentSlotService.createOpenSlot({ role: req.user.role, body: req.body }));
/** PUT /open-slots/:id — time / room; may reassign the doctor (same department only). */
exports.updateOpenSlot = sendResult((req) =>
  appointmentSlotService.updateOpenSlot({ role: req.user.role, id: req.params.id, body: req.body })
);
exports.deleteOpenSlot = sendResult((req) => appointmentSlotService.deleteOpenSlot({ role: req.user.role, id: req.params.id }));

// ─── Patient's own appointments + portal ───
exports.createAppointment = sendResult((req) =>
  appointmentPatientService.createAppointment({ userId: req.user.userId, body: req.body })
);
exports.getAppointments = sendResult((req) => appointmentPatientService.getAppointmentsForUser(req.user.userId));
exports.updateAppointment = sendResult((req) =>
  appointmentPatientService.updatePatientAppointment({ userId: req.user.userId, id: req.params.id, body: req.body })
);
exports.deleteAppointment = sendResult((req) =>
  appointmentPatientService.deletePatientAppointment({ userId: req.user.userId, id: req.params.id, body: req.body })
);
exports.getPortalPatients = sendJson(() => appointmentPatientPortalService.getPortalPatients());
exports.getPatientDashboardSummary = sendJson((req) => appointmentPatientPortalService.getPatientDashboardSummary(req.user.userId));
exports.getPatientMedicalVisits = sendJson((req) => appointmentPatientPortalService.getPatientMedicalVisits(req.user.userId));
exports.getPatientMedicalRegimens = sendJson((req) => appointmentPatientPortalService.getPatientMedicalRegimens(req.user.userId));
exports.getPatientSymptomLogs = sendJson((req) => appointmentPatientPortalService.getPatientSymptomLogs(req.user.userId));
exports.getPatientLabTestDetails = sendResult((req) =>
  appointmentPatientPortalService.getPatientLabTestDetails(req.user.userId, req.params.testId)
);

// ─── Nurse check-in ───
/** GET /nurse/check-in-options?patientId=OP00000001|1 */
exports.getNurseCheckInOptions = sendResult((req) =>
  appointmentNurseService.getNurseCheckInOptions({ role: req.user.role, query: req.query })
);
exports.postNurseCheckInAccept = sendResult((req) =>
  appointmentNurseService.postNurseCheckInAccept({ role: req.user.role, body: req.body })
);
exports.postNurseCheckInAssign = sendResult((req) =>
  appointmentNurseService.postNurseCheckInAssign({ role: req.user.role, body: req.body })
);
exports.postNurseCheckInReschedule = sendResult((req) =>
  appointmentNurseService.postNurseCheckInReschedule({ role: req.user.role, body: req.body })
);
/** POST /nurse/regimen/checkout — legacy / admin; doctors close visits on the doctor routes. */
exports.postNurseRegimenCheckout = sendResult((req) =>
  appointmentNurseService.postNurseRegimenCheckout({ role: req.user.role, body: req.body })
);
