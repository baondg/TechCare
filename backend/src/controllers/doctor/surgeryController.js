const surgeryService = require('../../services/emr/surgeryService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/doctor/patients/:patientId/surgeries */
exports.getSurgeries = asyncHandler(async (req, res) => {
  res.json({ success: true, surgeries: await surgeryService.listSurgeries(req.params.patientId) });
});

/** POST /api/doctor/patients/:patientId/surgeries — `{ type?, start?, end?, doctorId?, surgeonName?, urgency?, result?, note? }` */
exports.createSurgery = asyncHandler(async (req, res) => {
  const surgery = await surgeryService.createSurgery(req.params.patientId, req.user, req.body);
  res.status(201).json({ success: true, surgery });
});

/** PUT /api/doctor/patients/:patientId/surgeries/:id — any subset of the create fields. */
exports.updateSurgery = asyncHandler(async (req, res) => {
  const surgery = await surgeryService.updateSurgery(req.params.patientId, req.params.id, req.body);
  res.json({ success: true, surgery });
});
