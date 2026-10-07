const prescriptionService = require('../../services/emr/prescriptionService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/doctor/patients/:patientId/prescriptions */
exports.getPrescriptions = asyncHandler(async (req, res) => {
  const prescriptions = await prescriptionService.listPrescriptions(req.params.patientId, req.user);
  res.json({ success: true, prescriptions });
});

/** POST /api/doctor/patients/:patientId/prescriptions — `{ medications, department?, duration?, byt? }` */
exports.createPrescription = asyncHandler(async (req, res) => {
  const prescription = await prescriptionService.createPrescription(req.params.patientId, req.user, req.body);
  res.status(201).json({ success: true, prescription });
});

/** PUT /api/doctor/patients/:patientId/prescriptions/:id — replaces the lines; same body as create. */
exports.updatePrescription = asyncHandler(async (req, res) => {
  const prescription = await prescriptionService.updatePrescription(req.params.patientId, req.params.id, req.user, req.body);
  res.json({ success: true, prescription });
});
