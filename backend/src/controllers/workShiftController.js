const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

function formatName(first, last) {
  const a = String(first || '').trim();
  const b = String(last || '').trim();
  const n = `${a} ${b}`.trim();
  return n || '—';
}

/**
 * GET /api/work-shifts?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Returns WORK_SHIFT rows where the logged-in doctor | nurse | technician participates.
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

    let staffColumn;
    let staffId;
    if (role === 'doctor') {
      const [row] = await sequelize.query('SELECT doctor_id AS id FROM DOCTOR WHERE user_id = :uid LIMIT 1', {
        replacements: { uid: userId },
        type: QueryTypes.SELECT,
      });
      staffId = row?.id != null ? Number(row.id) : null;
      staffColumn = 'doctor_id';
    } else if (role === 'nurse') {
      const [row] = await sequelize.query('SELECT nurse_id AS id FROM NURSE WHERE user_id = :uid LIMIT 1', {
        replacements: { uid: userId },
        type: QueryTypes.SELECT,
      });
      staffId = row?.id != null ? Number(row.id) : null;
      staffColumn = 'nurse_id';
    } else {
      const [row] = await sequelize.query(
        'SELECT technician_id AS id FROM TECHNICIAN WHERE user_id = :uid LIMIT 1',
        { replacements: { uid: userId }, type: QueryTypes.SELECT }
      );
      staffId = row?.id != null ? Number(row.id) : null;
      staffColumn = 'technician_id';
    }

    if (staffId == null || !Number.isFinite(staffId)) {
      return res.json({ success: true, shifts: [], staffRole: role, message: 'No staff profile linked to this account.' });
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

    // DATETIME must be returned as strings (DATE_FORMAT). If we pass JS Date through
    // JSON it becomes ISO UTC and the browser shifts wall-clock times (e.g. +7 for VN).
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
      WHERE ws.${staffColumn} = :staffId
        AND ws.start_time < :endDt
        AND ws.end_time > :startDt
      ORDER BY ws.start_time ASC
    `;

    const rows = await sequelize.query(sql, {
      replacements: { staffId, startDt, endDt },
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

    return res.json({ success: true, shifts, startDate, endDate, staffRole: role });
  } catch (error) {
    console.error('getMyWorkShifts error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};
