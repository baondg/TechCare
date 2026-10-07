const appointmentRepository = require('../repositories/appointmentRepository');

function parseDoctorDepartmentSet(value) {
  if (value == null || value === '') return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Booking catalog: doctors with their department names (DOCTOR_DEPARTMENT, else `specifications`). */
async function getDoctors() {
  const rows = await appointmentRepository.listDoctorRowsForBookingCatalog();
  const byId = new Map();
  for (const row of rows || []) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        username: row.username,
        firstName: row.firstName,
        lastName: row.lastName,
        specifications: row.specifications,
        room: row.room,
        deptNames: new Set(),
      });
    }
    const dn = row.deptName != null ? String(row.deptName).trim() : '';
    if (dn) byId.get(id).deptNames.add(dn);
  }

  const doctors = Array.from(byId.values()).map((m) => {
    let departments = [...m.deptNames];
    const spec = String(m.specifications || '').trim();
    if (departments.length === 0 && spec) {
      departments = parseDoctorDepartmentSet(spec.replace(/;/g, ','));
    }
    return {
      id: m.id,
      username: m.username,
      firstName: m.firstName,
      lastName: m.lastName,
      departments,
      department: departments[0] || spec || undefined,
      room: m.room,
    };
  });

  return doctors;
}

async function getClinicRooms() {
  return appointmentRepository.listClinicRoomsCatalog();
}

async function getDepartments() {
  const rows = await appointmentRepository.listDepartmentsCatalog();
  return (rows || []).map((r) => ({
    id: Number(r.id),
    name: String(r.name || '').trim(),
  }));
}

module.exports = {
  getDoctors,
  getClinicRooms,
  getDepartments,
};
