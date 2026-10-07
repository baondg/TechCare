const regimenService = require('../../services/emr/regimenService');
const regimenDocumentsService = require('../../services/emr/regimenDocumentsService');
const transferService = require('../../services/emr/transferService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/doctor/patients/:patientId/regimen/active — open visit + check-in room (nurse UI sync). */
exports.getActiveRegimenForPatient = asyncHandler(async (req, res) => {
  const { active, checkInRoom } = await regimenService.getActiveRegimen(req.params.patientId);
  res.json({ success: true, active, checkInRoom });
});

/** POST /api/doctor/patients/:patientId/regimen/close — doctor finishes the examination. */
exports.closeOpenRegimenForPatient = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await regimenService.closeOpenRegimens(req.params.patientId)) });
});

/** POST /api/doctor/patients/:patientId/health-tracking-slips — `{ recordIds, ms?, admissionNo?, note? }` */
exports.createHealthTrackingSlipForPatient = asyncHandler(async (req, res) => {
  const slip = await regimenService.createHealthTrackingSlip(req.params.patientId, req.user, req.body);
  res.status(201).json({ success: true, slip });
});

/** POST /api/doctor/patients/:patientId/follow-up-reexam-slip — `{ slip: { patientName, … } }` */
exports.createFollowUpReexamSlipForPatient = asyncHandler(async (req, res) => {
  const slip = await regimenService.createFollowUpReexamSlip(req.params.patientId, req.user, req.body);
  res.status(201).json({ success: true, slip });
});

/** GET /api/doctor/patients/:patientId/regimen/active/documents — review before finishing the examination. */
exports.getActiveRegimenDocumentsForPatient = asyncHandler(async (req, res) => {
  res.json({ success: true, regimen: await regimenDocumentsService.getOpenRegimenDocuments(req.params.patientId) });
});

/** GET /api/doctor/patients/:patientId/medical-regimens — completed visits. */
exports.getPatientMedicalRegimensForDoctor = asyncHandler(async (req, res) => {
  res.json({ success: true, regimens: await regimenDocumentsService.listCompletedRegimens(req.params.patientId) });
});

/** POST /api/doctor/patients/:patientId/transfers — clinic (`fromRoomId`, `toRoomId`) or hospital (`toHospitalName`, …) transfer. */
exports.createPatientTransfer = asyncHandler(async (req, res) => {
  const transfer = await transferService.createPatientTransfer(req.params.patientId, req.user, req.body);
  res.status(201).json({ success: true, transfer });
});
