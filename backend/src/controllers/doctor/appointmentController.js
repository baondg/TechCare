const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const { notifyPatientDoctorCover, notifyPatientDoctorAcceptedBooking, notifyPatientDoctorDeclinedBooking, notifyPatientAppointmentDoctorReassigned, notifyDoctorReceivedCoverAppointment } = require('../../services/appointmentNotifications');
const logger = require('../../common/logger');

// ═══════════════════════════════════════════════
//  APPOINTMENTS (Doctor-specific)
// ═══════════════════════════════════════════════

/**
 * GET /api/doctor/appointments
 * Get all appointments for this doctor
 */
exports.getAppointments = async (req, res) => {
  try {
    const doctorUserId = req.user.userId;
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: doctorUserId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    if (!doctorId) {
      return res.json({ success: true, appointments: [] });
    }

    const { status, startDate, endDate } = req.query;
    const replacements = {
      doctorId,
      startDate: startDate ? String(startDate) : null,
      endDate: endDate ? String(endDate) : null,
    };
    let statusFilter = '';
    if (status) {
      const normalized = String(status).toLowerCase();
      if (normalized === 'pending' || normalized === 'confirmed' || normalized === 'upcoming') {
        statusFilter = " AND a.status = 'scheduled' ";
      } else if (normalized === 'done' || normalized === 'completed') {
        statusFilter = " AND a.status = 'completed' ";
      } else if (normalized === 'cancelled' || normalized === 'rejected') {
        statusFilter = " AND a.status = 'cancelled' ";
      }
    }

    const rows = await sequelize.query(
      `SELECT
         a.id,
         DATE(a.time) AS date,
         TIME(a.time) AS time,
         a.status AS dbStatus,
         CASE
           WHEN a.status IN ('completed', 'cancelled') THEN a.status
           WHEN EXISTS (
             SELECT 1 FROM REGIMEN r
             WHERE r.patient_id = a.patient_id
               AND r.\`end\` IS NOT NULL
               AND DATE(a.time) = DATE(r.start)
               AND a.time >= r.start
               AND a.time <= r.\`end\`
           ) THEN 'completed'
           ELSE a.status
         END AS effectiveStatus,
         COALESCE(a.doctor_confirmed, 1) AS doctorConfirmed,
         a.\`condition\` AS symptoms,
         '' AS notes,
         cr.name AS room,
         COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department,
         p.patient_id AS patientId,
         p.user_id AS userId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('patient#', p.user_id)) AS patientName
       FROM APPOINTMENT a
       JOIN PATIENT p ON p.patient_id = a.patient_id
       JOIN USER u ON u.id = p.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = p.user_id
       JOIN DOCTOR d ON d.doctor_id = a.doctor_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
       WHERE a.doctor_id = :doctorId
         AND (:startDate IS NULL OR DATE(a.time) >= :startDate)
         AND (:endDate IS NULL OR DATE(a.time) <= :endDate)
         ${statusFilter}
       ORDER BY a.time DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    const appointments = rows.map((r) => {
      const effectiveStatus = String(r.effectiveStatus || r.dbStatus || '').toLowerCase();
      const confirmed = Number(r.doctorConfirmed) !== 0;
      const isDone = effectiveStatus === 'completed';
      const isCancelled = effectiveStatus === 'cancelled';
      const awaitingDoctorConfirmation =
        !isDone && !isCancelled && effectiveStatus === 'scheduled' && r.patientId != null && !confirmed;
      return {
        id: r.id,
        userId: Number(r.userId),
        patientId: Number(r.patientId),
        patientName: r.patientName,
        doctor: req.user.username || '',
        assignedDoctorId: Number(doctorId),
        department: r.department || '',
        date: r.date,
        time: r.time,
        room: r.room || '',
        symptoms: r.symptoms || '',
        notes: r.notes || '',
        doctorConfirmed: confirmed,
        awaitingDoctorConfirmation,
        examined: isDone,
        status: isDone ? 'Done' : isCancelled ? 'Cancelled' : 'Pending',
      };
    });

    res.json({ success: true, appointments });
  } catch (error) {
    logger.error({ err: error }, 'Get doctor appointments error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /api/doctor/appointments
 * Doctor creates an appointment for a patient
 */
exports.createAppointment = async (req, res) => {
  try {
    const { patientId, department, date, time, room, symptoms, notes } = req.body;

    if (!patientId || !department || !date || !time) {
      return res.status(400).json({ success: false, message: 'Patient, department, date and time are required' });
    }
    const doctorRows = await sequelize.query(
      'SELECT doctor_id, room_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor profile not found' });
    }
    const patientUserId = Number(String(patientId).replace(/^OP0*/i, ''));
    const patientRows = await sequelize.query(
      'SELECT patient_id FROM PATIENT WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: patientUserId }, type: QueryTypes.SELECT }
    );
    const patientPk = patientRows[0]?.patient_id;
    if (!patientPk) {
      return res.status(400).json({ success: false, message: 'Patient profile not found' });
    }
    const dateTime = `${date} ${String(time).slice(0, 8)}`;
    const existing = await sequelize.query(
      `SELECT id FROM APPOINTMENT
       WHERE doctor_id = :doctorId AND time = :dateTime AND status = 'scheduled'
       LIMIT 1`,
      { replacements: { doctorId, dateTime }, type: QueryTypes.SELECT }
    );
    if (existing[0]) {
      return res.status(409).json({ success: false, message: 'This time slot is already booked' });
    }
    let roomId = doctorRows[0]?.room_id || null;
    if (!roomId && room) {
      const roomRows = await sequelize.query(
        'SELECT id FROM CLINIC_ROOM WHERE name = :name LIMIT 1',
        { replacements: { name: room }, type: QueryTypes.SELECT }
      );
      roomId = roomRows[0]?.id || null;
    }
    if (!roomId) {
      const fallback = await sequelize.query('SELECT id FROM CLINIC_ROOM LIMIT 1', { type: QueryTypes.SELECT });
      roomId = fallback[0]?.id || null;
    }
    if (!roomId) {
      return res.status(400).json({ success: false, message: 'No clinic room available' });
    }
    const [appointmentId] = await sequelize.query(
      `INSERT INTO APPOINTMENT (time, status, \`condition\`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
       VALUES (:dateTime, 'scheduled', :condition, :patientPk, :doctorId, :roomId, NULL, 1)`,
      {
        replacements: {
          dateTime,
          condition: symptoms || notes || 'General consultation',
          patientPk,
          doctorId,
          roomId
        },
        type: QueryTypes.INSERT
      }
    );
    const appointment = {
      id: appointmentId,
      patientId: patientUserId,
      department,
      date,
      time,
      room: room || '',
      symptoms: symptoms || '',
      notes: notes || '',
      status: 'Pending'
    };
    res.status(201).json({ success: true, appointment });
  } catch (error) {
    logger.error({ err: error }, 'Create appointment error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/doctor/appointments/:id/cover
 * Reassign this slot to another doctor in the same department (patient is notified if booked).
 */
exports.coverAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const coverReason = String(req.body?.reason ?? req.body?.coverReason ?? '').trim();
    if (!coverReason) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }
    const coverDoctorId = Number(req.body?.coverDoctorId);
    if (!Number.isFinite(coverDoctorId) || coverDoctorId <= 0) {
      return res.status(400).json({ success: false, message: 'coverDoctorId is required' });
    }
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
    );
    const myDoctorId = doctorRows[0]?.doctor_id;
    if (!myDoctorId) {
      return res.status(403).json({ success: false, message: 'Doctor profile not found' });
    }

    const [appt] = await sequelize.query(
      `SELECT
         a.id,
         a.patient_id AS patientId,
         a.doctor_id AS doctorId,
         a.room_id AS roomId,
         a.time AS slotTime,
         a.status
       FROM APPOINTMENT a
       WHERE a.id = :id AND a.doctor_id = :myDoctorId AND a.status = 'scheduled'
       LIMIT 1`,
      { replacements: { id, myDoctorId }, type: QueryTypes.SELECT }
    );
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (Number(appt.doctorId) === coverDoctorId) {
      return res.status(400).json({ success: false, message: 'Choose a different doctor' });
    }

    const [slotDeptRow] = await sequelize.query(
      `SELECT cr.department_id AS deptId
       FROM APPOINTMENT a
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       WHERE a.id = :id
       LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    const slotDeptId =
      slotDeptRow?.deptId != null && Number.isFinite(Number(slotDeptRow.deptId))
        ? Number(slotDeptRow.deptId)
        : null;

    if (slotDeptId) {
      const [inSlotDept] = await sequelize.query(
        `SELECT 1 AS ok
         FROM DOCTOR_DEPARTMENT
         WHERE doctor_id = :did AND department_id = :deptId
         LIMIT 1`,
        { replacements: { did: coverDoctorId, deptId: slotDeptId }, type: QueryTypes.SELECT }
      );
      if (!inSlotDept) {
        return res.status(400).json({
          success: false,
          message: 'Covering doctor must work in the same department as this appointment room',
        });
      }
    } else {
      const [share] = await sequelize.query(
        `SELECT 1 AS ok
         FROM DOCTOR_DEPARTMENT dd1
         INNER JOIN DOCTOR_DEPARTMENT dd2 ON dd1.department_id = dd2.department_id
         WHERE dd1.doctor_id = :a AND dd2.doctor_id = :b
         LIMIT 1`,
        { replacements: { a: myDoctorId, b: coverDoctorId }, type: QueryTypes.SELECT }
      );
      if (!share) {
        return res.status(400).json({
          success: false,
          message: 'Covering doctor must work in the same department as you',
        });
      }
    }

    // Keep the booked slot's room. Changing to the cover doctor's default room can violate
    // UNIQUE(time, doctor_id, room_id) if that doctor already has (even cancelled) history at the same time+room.
    const roomIdNum =
      appt.roomId != null && appt.roomId !== '' && Number.isFinite(Number(appt.roomId))
        ? Number(appt.roomId)
        : null;

    const [conflict] = await sequelize.query(
      `SELECT x.id FROM APPOINTMENT x
       WHERE x.doctor_id = :doctorId
         AND x.time = (SELECT a2.time FROM APPOINTMENT a2 WHERE a2.id = :id LIMIT 1)
         AND x.status = 'scheduled'
         AND x.id <> :id
       LIMIT 1`,
      { replacements: { doctorId: coverDoctorId, id }, type: QueryTypes.SELECT }
    );
    if (conflict?.id) {
      return res.status(409).json({
        success: false,
        message: 'That doctor already has another appointment at this time',
      });
    }

    const [dupTriple] = await sequelize.query(
      `SELECT x.id FROM APPOINTMENT x
       WHERE x.doctor_id = :doctorId
         AND x.time = (SELECT a2.time FROM APPOINTMENT a2 WHERE a2.id = :id LIMIT 1)
         AND x.room_id = (SELECT a3.room_id FROM APPOINTMENT a3 WHERE a3.id = :id LIMIT 1)
         AND x.id <> :id
       LIMIT 1`,
      { replacements: { doctorId: coverDoctorId, id }, type: QueryTypes.SELECT }
    );
    if (dupTriple?.id) {
      return res.status(409).json({
        success: false,
        message: 'Cannot assign cover: this time and room are already tied to another record for that doctor',
      });
    }

    const [od] = await sequelize.query(
      `SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))), ''), a.username) AS name
       FROM DOCTOR d
       JOIN USER u ON u.id = d.user_id
       JOIN ACCOUNT a ON a.user_id = d.user_id
       WHERE d.doctor_id = :did LIMIT 1`,
      { replacements: { did: myDoctorId }, type: QueryTypes.SELECT }
    );
    const oldDoctorLabel = od?.name ? `Dr. ${String(od.name).trim()}` : `Doctor #${myDoctorId}`;

    await sequelize.query(`UPDATE APPOINTMENT SET doctor_id = :cid WHERE id = :id`, {
      replacements: { cid: coverDoctorId, id },
      type: QueryTypes.UPDATE,
    });

    const [nd] = await sequelize.query(
      `SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))), ''), a.username) AS name
       FROM DOCTOR d
       JOIN USER u ON u.id = d.user_id
       JOIN ACCOUNT a ON a.user_id = d.user_id
       WHERE d.doctor_id = :did LIMIT 1`,
      { replacements: { did: coverDoctorId }, type: QueryTypes.SELECT }
    );
    const newDoctorLabel = nd?.name ? `Dr. ${String(nd.name).trim()}` : `Doctor #${coverDoctorId}`;

    if (appt.patientId) {
      const [meta] = await sequelize.query(
        `SELECT
           DATE_FORMAT(a.time, '%d/%m/%Y') AS dateVi,
           DATE_FORMAT(a.time, '%H:%i') AS timeVi,
           COALESCE(NULLIF(TRIM(dep.name), ''), '') AS depName
         FROM APPOINTMENT a
         JOIN CLINIC_ROOM cr ON cr.id = a.room_id
         LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
         WHERE a.id = :id LIMIT 1`,
        { replacements: { id }, type: QueryTypes.SELECT }
      );
      await notifyPatientAppointmentDoctorReassigned({
        patientId: Number(appt.patientId),
        dateVi: meta?.dateVi || '',
        timeVi: meta?.timeVi || '',
        department: meta?.depName || '',
        oldDoctorName: oldDoctorLabel,
        newDoctorName: newDoctorLabel,
        reason: coverReason,
      });
    }

    await notifyDoctorReceivedCoverAppointment({
      appointmentId: Number(id),
      previousDoctorLabel: oldDoctorLabel,
    });

    return res.json({
      success: true,
      appointment: { id: Number(id), doctorId: coverDoctorId, roomId: roomIdNum },
    });
  } catch (error) {
    logger.error({ err: error }, 'Cover appointment error');
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/doctor/appointments/:id/cancel
 * Cancel an appointment
 */
exports.cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    const [row] = await sequelize.query(
      `SELECT id, patient_id AS patientPk, COALESCE(doctor_confirmed, 1) AS dc, status
       FROM APPOINTMENT WHERE id = :id AND doctor_id = :doctorId LIMIT 1`,
      { replacements: { id, doctorId }, type: QueryTypes.SELECT }
    );
    if (!row?.id) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (String(row.status).toLowerCase() !== 'scheduled') {
      return res.status(400).json({ success: false, message: 'Only scheduled visits can be cancelled here' });
    }
    if (Number(row.dc) === 0) {
      return res.status(400).json({
        success: false,
        message: 'This booking is not yet accepted. Use Decline to release the slot, or Accept first.',
      });
    }
    if (row.patientPk == null) {
      return res.status(400).json({ success: false, message: 'No patient is booked on this slot' });
    }
    await sequelize.query(
      `UPDATE APPOINTMENT SET status = 'cancelled', cancellation_reason = :reason WHERE id = :id`,
      { replacements: { id, reason }, type: QueryTypes.UPDATE }
    );
    await notifyPatientDoctorCover(id, reason);
    res.json({ success: true, appointment: { id: Number(id), status: 'Cancelled' } });
  } catch (error) {
    logger.error({ err: error }, 'Cancel appointment error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/doctor/appointments/:id/decline
 * Release a patient-requested slot (doctor_confirmed = 0) before acceptance.
 */
exports.declineAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    const [appt] = await sequelize.query(
      `SELECT
         a.patient_id AS patientPk,
         COALESCE(a.doctor_confirmed, 1) AS dc,
         a.status,
         DATE_FORMAT(a.time, '%d/%m/%Y') AS dateVi,
         DATE_FORMAT(a.time, '%H:%i') AS timeVi,
         COALESCE(NULLIF(TRIM(dep.name), ''), '') AS depName,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name,''),' ',COALESCE(du.last_name,''))), ''), dacc.username) AS doctorNameRaw
       FROM APPOINTMENT a
       JOIN DOCTOR d ON d.doctor_id = a.doctor_id
       JOIN USER du ON du.id = d.user_id
       JOIN ACCOUNT dacc ON dacc.user_id = d.user_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
       WHERE a.id = :id AND a.doctor_id = :doctorId
       LIMIT 1`,
      { replacements: { id, doctorId }, type: QueryTypes.SELECT }
    );
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (String(appt.status).toLowerCase() !== 'scheduled' || appt.patientPk == null || Number(appt.dc) !== 0) {
      return res.status(400).json({ success: false, message: 'Only pending patient booking requests can be declined' });
    }
    const patientPk = Number(appt.patientPk);
    const doctorLabel = appt.doctorNameRaw ? `Dr. ${String(appt.doctorNameRaw).trim()}` : `Doctor #${doctorId}`;
    await sequelize.query(
      `UPDATE APPOINTMENT
       SET patient_id = NULL,
           \`condition\` = 'Open slot',
           doctor_confirmed = 1,
           doctor_decline_reason = :reason
       WHERE id = :id AND doctor_id = :doctorId`,
      { replacements: { id, doctorId, reason }, type: QueryTypes.UPDATE }
    );
    await notifyPatientDoctorDeclinedBooking({
      patientId: patientPk,
      doctorLabel,
      dateVi: appt.dateVi || '',
      timeVi: appt.timeVi || '',
      department: appt.depName || '',
      reason,
    });
    res.json({ success: true, appointment: { id: Number(id), status: 'Open' } });
  } catch (error) {
    logger.error({ err: error }, 'Decline appointment error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /api/doctor/appointments/:id/confirm
 * Confirm a pending appointment
 */
exports.confirmAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    const [row] = await sequelize.query(
      `SELECT id, patient_id AS patientPk, COALESCE(doctor_confirmed, 1) AS dc, status
       FROM APPOINTMENT WHERE id = :id AND doctor_id = :doctorId LIMIT 1`,
      { replacements: { id, doctorId }, type: QueryTypes.SELECT }
    );
    if (!row?.id) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (String(row.status).toLowerCase() !== 'scheduled' || row.patientPk == null) {
      return res.status(400).json({ success: false, message: 'Nothing to confirm on this slot' });
    }
    if (Number(row.dc) !== 0) {
      return res.json({ success: true, appointment: { id: Number(id), status: 'Pending', doctorConfirmed: true } });
    }
    await sequelize.query(
      `UPDATE APPOINTMENT SET doctor_confirmed = 1, status = 'scheduled' WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    await notifyPatientDoctorAcceptedBooking(id);
    res.json({ success: true, appointment: { id: Number(id), status: 'Pending', doctorConfirmed: true } });
  } catch (error) {
    logger.error({ err: error }, 'Confirm appointment error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
