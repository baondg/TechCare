const labTestService = require('../../services/emr/labTestService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/doctor/patients/:patientId/lab-tests */
exports.getLabTests = asyncHandler(async (req, res) => {
  res.json({ success: true, labTests: await labTestService.listLabTests(req.params.patientId) });
});

/** POST /api/doctor/patients/:patientId/lab-tests — `{ testType, testDate, technicianId?, technicianName?, resultSummary?, fileUrl?, note? }` */
exports.createLabTest = asyncHandler(async (req, res) => {
  const labTest = await labTestService.createLabTest(req.params.patientId, req.user, req.body);
  res.status(201).json({ success: true, labTest });
});

/** PUT /api/doctor/patients/:patientId/lab-tests/:id — any subset of the create fields. */
exports.updateLabTest = asyncHandler(async (req, res) => {
  const labTest = await labTestService.updateLabTest(req.params.patientId, req.params.id, req.user, req.body);
  res.json({ success: true, labTest });
});

/** GET /api/doctor/patients/:patientId/lab-tests/:id/details */
exports.getLabTestDetails = asyncHandler(async (req, res) => {
  res.json({ success: true, details: await labTestService.listLabTestDetails(req.params.patientId, req.params.id) });
});

/** POST /api/doctor/lab-attachments — `{ fileName, mimeType, dataBase64 }` (PDF or image). */
exports.uploadLabAttachment = asyncHandler(async (req, res) => {
  res.json({ success: true, ...labTestService.saveLabAttachment(req.body || {}) });
});
