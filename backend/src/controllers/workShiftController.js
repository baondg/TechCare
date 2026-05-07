const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

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

/**
 * Resolve which WORK_SHIFT column filters this USER as participant.
 * @param {number} userId USER.id
 * @returns {Promise<{ staffColumn: string, staffId: number, participantRole: string } | null>}
 */
async function resolveStaffParticipation(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return null;

  const [doc] = await sequelize.query(
    'SELECT doctor_id AS id FROM DOCTOR WHERE user_id = :uid LIMIT 1',
    { replacements: { uid }, type: QueryTypes.SELECT }
  );
  if (doc?.id != null) {
    return { staffColumn: 'doctor_id', staffId: Number(doc.id), participantRole: 'doctor' };
  }

  const [nur] = await sequelize.query(
    'SELECT nurse_id AS id FROM NURSE WHERE user_id = :uid LIMIT 1',
    { replacements: { uid }, type: QueryTypes.SELECT }
  );
  if (nur?.id != null) {
    return { staffColumn: 'nurse_id', staffId: Number(nur.id), participantRole: 'nurse' };
  }

  const [tec] = await sequelize.query(
    'SELECT technician_id AS id FROM TECHNICIAN WHERE user_id = :uid LIMIT 1',
    { replacements: { uid }, type: QueryTypes.SELECT }
  );
  if (tec?.id != null) {
    return { staffColumn: 'technician_id', staffId: Number(tec.id), participantRole: 'technician' };
  }

  return null;
}

/**
 * GET /api/work-shifts/staff-directory
 * Clinical staff list for work-shift viewer picker (doctor | nurse | technician).
 */
exports.getStaffDirectory = async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (!['doctor', 'nurse', 'technician'].includes(role)) {
      return res.status(403).json({ success: false, message: 'This resource is only for clinical staff.' });
    }

    const sql = `
      SELECT u.id AS userId,
             u.first_name AS firstName,
             u.last_name AS lastName,
             acc.type AS accountType
      FROM ACCOUNT acc
      INNER JOIN \`USER\` u ON u.id = acc.user_id
      WHERE acc.type IN ('DOC','NUR','TEC') AND acc.status = 1
      ORDER BY
        CASE acc.type WHEN 'DOC' THEN 1 WHEN 'NUR' THEN 2 WHEN 'TEC' THEN 3 ELSE 9 END,
        u.last_name, u.first_name
    `;

    const rows = await sequelize.query(sql, { type: QueryTypes.SELECT });

    const staff = rows.map((r) => {
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

    return res.json({ success: true, staff });
  } catch (error) {
    console.error('getStaffDirectory error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/work-shifts?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&forUserId=optional USER.id | "all"
 * - Omit forUserId: shifts for the logged-in user (their doctor/nurse/tech row).
 * - forUserId=<number>: shifts where that user participates.
 * - forUserId=all: every shift overlapping the date range (whole clinic roster).
 */
exports.getMyWorkShifts = async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const userId = req.user?.userId;
    if (userId == null) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!['doctor', 'nurse', 'technician'].includes(role)) {
      return res.status(403).json({ success: false, message: 'This resource is only for clinical staff.' });
    }

    const rawFor = req.query.forUserId ?? req.query.forUser;
    const wantAll =
      rawFor != null && String(rawFor).trim().toLowerCase() === 'all';

    let targetUserId = Number(userId);
    let participantRole = null;
    let staffColumn = null;
    let staffId = null;

    if (wantAll) {
      targetUserId = null;
      participantRole = null;
    } else if (rawFor != null && String(rawFor).trim() !== '') {
      const fid = Number(rawFor);
      if (!Number.isFinite(fid) || fid <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid forUserId' });
      }
      targetUserId = fid;
    }

    if (!wantAll) {
      const resolved = await resolveStaffParticipation(targetUserId);
      if (!resolved) {
        return res.json({
          success: true,
          shifts: [],
          startDate: req.query.startDate,
          endDate: req.query.endDate,
          staffRole: role,
          viewedUserId: targetUserId,
          participantRole: null,
          viewAll: false,
          message: 'No staff profile linked to this account.',
        });
      }
      staffColumn = resolved.staffColumn;
      staffId = resolved.staffId;
      participantRole = resolved.participantRole;
    }

    let { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      const now = new Date();
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      startDate = s.toISOString().slice(0, 10);
      endDate = e.toISOString().slice(0, 10);
    }

    const startDt = `${String(startDate).slice(0, 10)} 00:00:00`;
    const endDt = `${String(endDate).slice(0, 10)} 23:59:59`;

    const staffFilter = wantAll
      ? `ws.start_time < :endDt AND ws.end_time > :startDt`
      : `ws.${staffColumn} = :staffId AND ws.start_time < :endDt AND ws.end_time > :startDt`;

    const sql = `
      SELECT
        ws.id,
        DATE_FORMAT(ws.start_time, '%Y-%m-%d %H:%i:%s') AS startTime,
        DATE_FORMAT(ws.end_time, '%Y-%m-%d %H:%i:%s') AS endTime,
        ws.room_id AS roomId,
        ws.doctor_id AS doctorId,
        ws.nurse_id AS nurseId,
        ws.technician_id AS technicianId,
        cr.name AS roomName,
        dep.name AS departmentName,
        docU.first_name AS doctorFirstName,
        docU.last_name AS doctorLastName,
        nurU.first_name AS nurseFirstName,
        nurU.last_name AS nurseLastName,
        tecU.first_name AS technicianFirstName,
        tecU.last_name AS technicianLastName
      FROM WORK_SHIFT ws
      INNER JOIN CLINIC_ROOM cr ON cr.id = ws.room_id
      LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
      LEFT JOIN DOCTOR d ON d.doctor_id = ws.doctor_id
      LEFT JOIN \`USER\` docU ON docU.id = d.user_id
      LEFT JOIN \`NURSE\` n ON n.nurse_id = ws.nurse_id
      LEFT JOIN \`USER\` nurU ON nurU.id = n.user_id
      LEFT JOIN TECHNICIAN t ON t.technician_id = ws.technician_id
      LEFT JOIN \`USER\` tecU ON tecU.id = t.user_id
      WHERE ${staffFilter}
      ORDER BY ws.start_time ASC
    `;

    const replacements = wantAll ? { startDt, endDt } : { staffId, startDt, endDt };
    const rows = await sequelize.query(sql, {
      replacements,
      type: QueryTypes.SELECT,
    });

    const shifts = rows.map((r) => {
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

    return res.json({
      success: true,
      shifts,
      startDate,
      endDate,
      staffRole: role,
      viewedUserId: wantAll ? null : targetUserId,
      participantRole,
      viewAll: wantAll,
    });
  } catch (error) {
    console.error('getMyWorkShifts error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};
