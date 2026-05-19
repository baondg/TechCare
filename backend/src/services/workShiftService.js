const workShiftRepository = require('../repositories/workShiftRepository');

function formatName(first, last) {
  const a = String(first || '').trim();
  const b = String(last || '').trim();
  const n = `${b} ${a}`.trim();
  return n || '—';
}

function mapAccountTypeToLabel(t) {
  const u = String(t || '').toUpperCase();
  if (u === 'DOC') return 'Doctor';
  if (u === 'NUR') return 'Nurse';
  if (u === 'TEC') return 'Technician';
  return u || '—';
}

async function resolveStaffParticipation(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return null;

  const doctorId = await workShiftRepository.selectDoctorStaffIdByUserId(uid);
  if (doctorId != null) {
    return { staffColumn: 'doctor_id', staffId: doctorId, participantRole: 'doctor' };
  }

  const nurseId = await workShiftRepository.selectNurseStaffIdByUserId(uid);
  if (nurseId != null) {
    return { staffColumn: 'nurse_id', staffId: nurseId, participantRole: 'nurse' };
  }

  const technicianId = await workShiftRepository.selectTechnicianStaffIdByUserId(uid);
  if (technicianId != null) {
    return { staffColumn: 'technician_id', staffId: technicianId, participantRole: 'technician' };
  }

  return null;
}

function isClinicalStaffRole(role) {
  return ['doctor', 'nurse', 'technician'].includes(String(role || '').toLowerCase());
}

async function getStaffDirectory(role) {
  if (!isClinicalStaffRole(role)) {
    return { status: 403, json: { success: false, message: 'This resource is only for clinical staff.' } };
  }

  const rows = await workShiftRepository.listClinicalStaffDirectory();
  const staff = (rows || []).map((r) => {
    const accountType = r.accountType ?? r.accounttype;
    const firstName = r.firstName ?? r.firstname;
    const lastName = r.lastName ?? r.lastname;
    return {
      userId: Number(r.userId ?? r.userid),
      firstName: firstName || '',
      lastName: lastName || '',
      accountType,
      roleLabel: mapAccountTypeToLabel(accountType),
      displayName: formatName(firstName, lastName),
    };
  });

  return { status: 200, json: { success: true, staff } };
}

async function getMyWorkShifts(userId, role, query) {
  if (userId == null) {
    return { status: 401, json: { success: false, message: 'Unauthorized' } };
  }
  if (!isClinicalStaffRole(role)) {
    return { status: 403, json: { success: false, message: 'This resource is only for clinical staff.' } };
  }

  const rawFor = query.forUserId ?? query.forUser;
  const wantAll = rawFor != null && String(rawFor).trim().toLowerCase() === 'all';

  let targetUserId = Number(userId);
  let participantRole = null;
  let staffColumn = null;
  let staffId = null;

  if (wantAll) {
    targetUserId = null;
  } else if (rawFor != null && String(rawFor).trim() !== '') {
    const fid = Number(rawFor);
    if (!Number.isFinite(fid) || fid <= 0) {
      return { status: 400, json: { success: false, message: 'Invalid forUserId' } };
    }
    targetUserId = fid;
  }

  if (!wantAll) {
    const resolved = await resolveStaffParticipation(targetUserId);
    if (!resolved) {
      return {
        status: 200,
        json: {
          success: true,
          shifts: [],
          startDate: query.startDate,
          endDate: query.endDate,
          staffRole: role,
          viewedUserId: targetUserId,
          participantRole: null,
          viewAll: false,
          message: 'No staff profile linked to this account.',
        },
      };
    }
    staffColumn = resolved.staffColumn;
    staffId = resolved.staffId;
    participantRole = resolved.participantRole;
    if (!workShiftRepository.isAllowedStaffColumn(staffColumn)) {
      return { status: 500, json: { success: false, message: 'Invalid staff profile mapping' } };
    }
  }

  let { startDate, endDate } = query;
  if (!startDate || !endDate) {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    startDate = s.toISOString().slice(0, 10);
    endDate = e.toISOString().slice(0, 10);
  }

  const startDt = `${String(startDate).slice(0, 10)} 00:00:00`;
  const endDt = `${String(endDate).slice(0, 10)} 23:59:59`;

  const rows = await workShiftRepository.listWorkShiftsInRange({
    staffColumn,
    staffId,
    startDt,
    endDt,
    wantAll,
  });

  const shifts = (rows || []).map((r) => {
    const startTime = r.startTime ?? r.starttime;
    const endTime = r.endTime ?? r.endtime;
    const roomId = r.roomId ?? r.roomid;
    const roomName = r.roomName ?? r.roomname;
    const departmentName = r.departmentName ?? r.departmentname;
    return {
      id: r.id,
      startTime,
      endTime,
      roomId,
      roomName: roomName || '—',
      departmentName: departmentName || '—',
      doctorId: r.doctorId ?? r.doctorid,
      nurseId: r.nurseId ?? r.nurseid,
      technicianId: r.technicianId ?? r.technicianid,
      doctorName: formatName(r.doctorFirstName ?? r.doctorfirstname, r.doctorLastName ?? r.doctorlastname),
      nurseName: formatName(r.nurseFirstName ?? r.nursefirstname, r.nurseLastName ?? r.nurselastname),
      technicianName: formatName(
        r.technicianFirstName ?? r.technicianfirstname,
        r.technicianLastName ?? r.technicianlastname
      ),
    };
  });

  return {
    status: 200,
    json: {
      success: true,
      shifts,
      startDate,
      endDate,
      staffRole: role,
      viewedUserId: wantAll ? null : targetUserId,
      participantRole,
      viewAll: wantAll,
    },
  };
}

module.exports = {
  getStaffDirectory,
  getMyWorkShifts,
};
