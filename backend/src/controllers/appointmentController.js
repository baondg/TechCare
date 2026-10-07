const appointmentPatientService = require('../services/appointmentPatientService');
const appointmentPatientPortalService = require('../services/appointmentPatientPortalService');
const appointmentSlotService = require('../services/appointmentSlotService');
const appointmentNurseService = require('../services/appointmentNurseService');
const appointmentCatalogService = require('../services/appointmentCatalogService');
const appointmentFeedbackService = require('../services/appointmentFeedbackService');
const appointmentAiService = require('../services/appointmentAiService');
const { asyncHandler } = require('../common/asyncHandler');
const { BadRequestError, NotFoundError } = require('../errors/AppError');

/** Services return data and throw AppError; each handler builds its JSON body. */

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
exports.createFeedback = asyncHandler(async (req, res) => {
  const feedback = await appointmentFeedbackService.create({ userId: req.user.userId, body: req.body });
  res.status(201).json({ success: true, feedback });
});

// ─── AI (patient) ───
exports.getAiRecommendations = sendJson(async (req) => ({
  success: true,
  recommendations: await appointmentAiService.getAiRecommendations(req.user.userId),
}));
exports.updateAiRecommendationFeedback = sendJson(async (req) => ({
  success: true,
  ...(await appointmentAiService.patchAiRecommendationFeedback(req.user.userId, req.params.id, req.body)),
}));
exports.chatWithAiAndSave = sendJson(async (req) => ({
  success: true,
  ...(await appointmentAiService.chatWithAiAndSave(req, req.user.userId, req.body)),
}));
exports.getAiChatModels = sendJson(async () => ({ success: true, models: await appointmentAiService.listAiChatModels() }));
exports.analyzeSymptomsAndSave = sendJson(async (req) => ({
  success: true,
  ...(await appointmentAiService.analyzeSymptomsAndSave(req, req.user.userId, req.body)),
}));

/** GET /api/appointments/ai/recovery-prediction — the signed-in patient's own prediction. */
exports.getRecoveryPrediction = sendJson(async (req) => {
  const patientId = await appointmentPatientService.getPatientPkForUserId(req.user.userId);
  if (!patientId) throw new NotFoundError('Patient profile not found');
  return appointmentAiService.recoveryPredictionForPatient(req, patientId, wantsRefresh(req.query));
});

/**
 * GET /api/doctor/patients/:patientId/recovery-prediction — same payload for EMR staff
 * (the doctor router already requires doctor.emr.read).
 */
exports.getStaffPatientRecoveryPrediction = sendJson(async (req) => {
  const routeId = Number(String(req.params.patientId || '').replace(/^OP0*/i, ''));
  if (!Number.isFinite(routeId) || routeId <= 0) throw new BadRequestError('Invalid patient id');
  const patientId = await appointmentPatientService.getPatientPkFromRouteId(routeId);
  if (!patientId) throw new NotFoundError('Patient not found');
  return appointmentAiService.recoveryPredictionForPatient(req, patientId, wantsRefresh(req.query));
});

// ─── Booking catalog (doctors with their departments, rooms, departments) ───
exports.getDoctors = sendJson(async () => ({ success: true, doctors: await appointmentCatalogService.getDoctors() }));
exports.getClinicRooms = sendJson(async () => ({ success: true, rooms: await appointmentCatalogService.getClinicRooms() }));
exports.getDepartments = sendJson(async () => ({ success: true, departments: await appointmentCatalogService.getDepartments() }));

// ─── Slots ───
/** GET /booked-slots?date=YYYY-MM-DD — booked (time, doctor) pairs of a day. */
exports.getBookedSlots = sendJson(async (req) => ({
  success: true,
  slots: await appointmentSlotService.getBookedSlots({ date: req.query.date }),
}));
/** GET /open-slots?startDate=&endDate= — open and booked slots in a range (patients: what they may book). */
exports.getOpenSlots = sendJson(async (req) => ({
  success: true,
  slots: await appointmentSlotService.getOpenSlots({ role: req.user.role, query: req.query }),
}));
exports.createOpenSlot = asyncHandler(async (req, res) => {
  const slot = await appointmentSlotService.createOpenSlot({ body: req.body });
  res.status(201).json({ success: true, slot });
});
/** PUT /open-slots/:id — time / room; may reassign the doctor (same department only). */
exports.updateOpenSlot = sendJson(async (req) => ({
  success: true,
  ...(await appointmentSlotService.updateOpenSlot({ id: req.params.id, body: req.body })),
}));
exports.deleteOpenSlot = sendJson(async (req) => ({
  success: true,
  id: await appointmentSlotService.deleteOpenSlot({ id: req.params.id }),
}));

// ─── Patient's own appointments + portal ───
exports.createAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentPatientService.createAppointment({ userId: req.user.userId, body: req.body });
  res.status(201).json({ success: true, appointment });
});
exports.getAppointments = sendJson((req) => appointmentPatientService.getAppointmentsForUser(req.user.userId));
exports.updateAppointment = sendJson(async (req) => ({
  success: true,
  appointment: await appointmentPatientService.updatePatientAppointment({ userId: req.user.userId, id: req.params.id, body: req.body }),
}));
exports.deleteAppointment = sendJson(async (req) => {
  await appointmentPatientService.deletePatientAppointment({ userId: req.user.userId, id: req.params.id, body: req.body });
  return { success: true, message: 'Appointment deleted successfully' };
});
exports.getPortalPatients = sendJson(() => appointmentPatientPortalService.getPortalPatients());
exports.getPatientDashboardSummary = sendJson((req) => appointmentPatientPortalService.getPatientDashboardSummary(req.user.userId));
exports.getPatientMedicalVisits = sendJson((req) => appointmentPatientPortalService.getPatientMedicalVisits(req.user.userId));
exports.getPatientMedicalRegimens = sendJson((req) => appointmentPatientPortalService.getPatientMedicalRegimens(req.user.userId));
exports.getPatientSymptomLogs = sendJson((req) => appointmentPatientPortalService.getPatientSymptomLogs(req.user.userId));
exports.getPatientLabTestDetails = sendJson(async (req) => ({
  success: true,
  details: await appointmentPatientPortalService.getPatientLabTestDetails(req.user.userId, req.params.testId),
}));

// ─── Nurse check-in ───
/** GET /nurse/check-in-options?patientId=OP00000001|1 */
exports.getNurseCheckInOptions = sendJson(async (req) => ({
  success: true,
  ...(await appointmentNurseService.getNurseCheckInOptions({ query: req.query })),
}));
exports.postNurseCheckInAccept = sendJson(async (req) => ({
  success: true,
  ...(await appointmentNurseService.postNurseCheckInAccept({ body: req.body })),
}));
exports.postNurseCheckInAssign = sendJson(async (req) => ({
  success: true,
  ...(await appointmentNurseService.postNurseCheckInAssign({ body: req.body })),
}));
exports.postNurseCheckInReschedule = sendJson(async (req) => ({
  success: true,
  ...(await appointmentNurseService.postNurseCheckInReschedule({ body: req.body })),
}));
/** POST /nurse/regimen/checkout — legacy / admin; doctors close visits on the doctor routes. */
exports.postNurseRegimenCheckout = sendJson(async (req) => ({
  success: true,
  regimenId: await appointmentNurseService.postNurseRegimenCheckout({ body: req.body }),
}));
