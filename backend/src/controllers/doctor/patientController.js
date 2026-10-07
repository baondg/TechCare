const patientRecordService = require('../../services/emr/patientRecordService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/doctor/patients?search=&page=&limit= — patient list with latest diagnosis / BMI / department. */
exports.getPatients = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await patientRecordService.listPatients(req.query)) });
});

/** GET /api/doctor/patients/:patientId — EMR header (cached). */
exports.getPatient = asyncHandler(async (req, res) => {
  res.json(await patientRecordService.getPatientRecord(req.params.patientId));
});
