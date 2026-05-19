const appointmentRepository = require('../repositories/appointmentRepository');

function parseDoctorDepartmentSet(value) {
  if (value == null || value === '') return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

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

  return { ok: true, status: 200, json: { success: true, doctors } };
}

async function getClinicRooms() {
  const rooms = await appointmentRepository.listClinicRoomsCatalog();
  return { ok: true, status: 200, json: { success: true, rooms } };
}

async function getDepartments() {
  const rows = await appointmentRepository.listDepartmentsCatalog();
  const departments = (rows || []).map((r) => ({
    id: Number(r.id),
    name: String(r.name || '').trim(),
  }));
  return { ok: true, status: 200, json: { success: true, departments } };
}

module.exports = {
  getDoctors,
  getClinicRooms,
  getDepartments,
};
