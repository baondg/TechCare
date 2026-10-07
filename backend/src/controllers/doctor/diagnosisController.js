const diagnosisService = require('../../services/emr/diagnosisService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/doctor/patients/:patientId/diagnoses */
exports.getDiagnoses = asyncHandler(async (req, res) => {
  res.json({ success: true, diagnoses: await diagnosisService.listDiagnoses(req.params.patientId) });
});

/** POST /api/doctor/patients/:patientId/diagnoses — `{ complaint, icd10, interpretation?, note?, department? }` */
exports.createDiagnosis = asyncHandler(async (req, res) => {
  const diagnosis = await diagnosisService.createDiagnosis(req.params.patientId, req.user, req.body);
  res.status(201).json({ success: true, diagnosis });
});

/** PUT /api/doctor/patients/:patientId/diagnoses/:id — same body as create. */
exports.updateDiagnosis = asyncHandler(async (req, res) => {
  const diagnosis = await diagnosisService.updateDiagnosis(req.params.patientId, req.params.id, req.user, req.body);
  res.json({ success: true, diagnosis });
});
