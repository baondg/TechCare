const healthInfoService = require('../../services/emr/healthInfoService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/doctor/patients/:patientId/health-info — latest vital signs + patient JSON columns. */
exports.getHealthInfo = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await healthInfoService.getLatest(req.params.patientId)) });
});

/** GET /api/doctor/patients/:patientId/health-info/history?page=&limit= */
exports.getHealthInfoHistory = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await healthInfoService.getHistory(req.params.patientId, req.query)) });
});

/** POST /api/doctor/patients/:patientId/health-info — new MEDICAL_RECORD snapshot. */
exports.createHealthInfo = asyncHandler(async (req, res) => {
  const healthInfo = await healthInfoService.create(req.params.patientId, req.body);
  res.status(201).json({ success: true, healthInfo });
});

/** PUT /api/doctor/patients/:patientId/health-info/:id — draft records only. */
exports.updateHealthInfo = asyncHandler(async (req, res) => {
  const healthInfo = await healthInfoService.update(req.params.patientId, req.params.id, req.body);
  res.json({ success: true, healthInfo });
});

/** DELETE /api/doctor/patients/:patientId/health-info/:id */
exports.deleteHealthInfo = asyncHandler(async (req, res) => {
  await healthInfoService.remove(req.params.patientId, req.params.id);
  res.json({ success: true, message: 'Health info record deleted' });
});

/** PATCH /api/doctor/patients/:patientId/health-info/:id/confirm — draft → confirmed. */
exports.confirmHealthInfo = asyncHandler(async (req, res) => {
  const record = await healthInfoService.confirm(req.params.patientId, req.params.id);
  res.json({ success: true, id: record.id, status: 'confirmed' });
});
