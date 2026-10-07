const catalogService = require('../../services/emr/catalogService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/doctor/diseases?q= — ICD-10 codes for the diagnosis combobox. */
exports.getDiseaseCodes = asyncHandler(async (req, res) => {
  res.json({ success: true, diseases: await catalogService.searchDiseases(req.query.q) });
});

/** GET /api/doctor/medicines?q= — MEDICINE names for the prescription combobox. */
exports.getMedicines = asyncHandler(async (req, res) => {
  res.json({ success: true, medicines: await catalogService.searchMedicines(req.query.q) });
});

/** GET /api/doctor/technicians — all technicians (lab order combobox). */
exports.getTechnicians = asyncHandler(async (req, res) => {
  res.json({ success: true, technicians: await catalogService.listTechnicians() });
});

/** GET /api/doctor/departments — DEPARTMENT master list. */
exports.getDepartments = asyncHandler(async (req, res) => {
  res.json({ success: true, departments: await catalogService.listDepartments() });
});
