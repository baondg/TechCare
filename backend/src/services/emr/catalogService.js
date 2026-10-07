const catalogRepository = require('../../repositories/catalogRepository');

/** ICD-10 codes matching `q` (code or description); all when blank. */
async function searchDiseases(q) {
  return catalogRepository.searchDiseases(String(q || '').trim());
}

/** Medicines whose name matches `q`; all when blank. */
async function searchMedicines(q) {
  return catalogRepository.searchMedicines(String(q || '').trim());
}

async function listTechnicians() {
  return catalogRepository.listTechnicians();
}

async function listDepartments() {
  const rows = await catalogRepository.listDepartments();
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name || '').trim() }));
}

module.exports = { searchDiseases, searchMedicines, listTechnicians, listDepartments };
