const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

const normalizeDoctorInput = (value) => String(value || '').replace(/^Dr\.\s*/i, '').trim();

async function getPatientIdByUserId(userId) {
  const rows = await sequelize.query(
    'SELECT patient_id FROM PATIENT WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return rows[0]?.patient_id || null;
}

async function getDoctorByInput(doctorInput) {
  const normalized = normalizeDoctorInput(doctorInput);
  const rows = await sequelize.query(
    `SELECT d.doctor_id, a.username, u.first_name, u.last_name, d.room_id
     FROM DOCTOR d
     JOIN ACCOUNT a ON a.user_id = d.user_id
     JOIN USER u ON u.id = d.user_id
     WHERE a.username = :raw
        OR a.username = :normalized
        OR TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) = :normalized
     LIMIT 1`,
    {
      replacements: { raw: String(doctorInput || '').trim(), normalized },
      type: QueryTypes.SELECT
    }
  );
  return rows[0] || null;
}

/**
 * GET /api/appointments/doctors
 * Return all active doctors (for patient booking)
 */
exports.getDoctors = async (req, res) => {
  try {
    const doctors = await sequelize.query(
      `SELECT
         d.doctor_id AS id,
         a.username,
         u.first_name AS firstName,
         u.last_name AS lastName,
         d.specifications AS department,
         cr.name AS room
       FROM DOCTOR d
       JOIN ACCOUNT a ON a.user_id = d.user_id
       JOIN USER u ON u.id = d.user_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = d.room_id
       ORDER BY d.specifications ASC, u.first_name ASC`,
      { type: QueryTypes.SELECT }
    );
    res.json({ success: true, doctors });
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/appointments/booked-slots?date=YYYY-MM-DD
 * Return already-booked (time, doctor) pairs for a given date.
 */
exports.getBookedSlots = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'date query param required' });
    const booked = await sequelize.query(
      `SELECT
         TIME(a.time) AS time,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username) AS doctor
       FROM APPOINTMENT a
       JOIN DOCTOR d ON d.doctor_id = a.doctor_id
       JOIN ACCOUNT acc ON acc.user_id = d.user_id
       JOIN USER u ON u.id = d.user_id
       WHERE DATE(a.time) = :date AND a.status = 'scheduled'`,
      { replacements: { date }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, slots: booked });
  } catch (error) {
    console.error('Get booked slots error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createAppointment = async (req, res) => {
  try {
    const { doctor, department, date, time, room, symptoms, notes } = req.body;
    const userId = req.user.userId;
    
    if (!doctor || !department || !date || !time) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const patientId = await getPatientIdByUserId(userId);
    if (!patientId) {
      return res.status(400).json({ message: 'Patient profile not found' });
    }
    const doctorRow = await getDoctorByInput(doctor);
    if (!doctorRow) {
      return res.status(400).json({ message: 'Doctor not found' });
    }
    const dateTime = `${date} ${String(time).slice(0, 8)}`;
    const exists = await sequelize.query(
      `SELECT id FROM APPOINTMENT
       WHERE doctor_id = :doctorId AND time = :dt AND status = 'scheduled'
       LIMIT 1`,
      {
        replacements: { doctorId: doctorRow.doctor_id, dt: dateTime },
        type: QueryTypes.SELECT
      }
    );
    if (exists[0]) {
      return res.status(409).json({ message: 'This time slot is already booked. Please choose another time.' });
    }
    let roomId = doctorRow.room_id || null;
    if (!roomId && room) {
      const r = await sequelize.query(
        'SELECT id FROM CLINIC_ROOM WHERE name = :name LIMIT 1',
        { replacements: { name: room }, type: QueryTypes.SELECT }
      );
      roomId = r[0]?.id || null;
    }
    if (!roomId) {
      // APPOINTMENT.room_id is NOT NULL in schema; fallback to any available room
      const fallback = await sequelize.query(
        'SELECT id FROM CLINIC_ROOM LIMIT 1',
        { type: QueryTypes.SELECT }
      );
      roomId = fallback[0]?.id || null;
    }
    if (!roomId) {
      return res.status(400).json({ message: 'No clinic room available to schedule appointment' });
    }
    const [id] = await sequelize.query(
      `INSERT INTO APPOINTMENT (time, status, \`condition\`, patient_id, doctor_id, room_id, regimen_id)
       VALUES (:time, 'scheduled', :condition, :patientId, :doctorId, :roomId, NULL)`,
      {
        replacements: {
          time: dateTime,
          condition: symptoms || notes || 'General consultation',
          patientId,
          doctorId: doctorRow.doctor_id,
          roomId
        },
        type: QueryTypes.INSERT
      }
    );
    res.status(201).json({
      success: true,
      appointment: {
        id,
        doctor: `Dr. ${doctorRow.first_name || ''} ${doctorRow.last_name || ''}`.trim(),
        department,
        date,
        time,
        room: room || '',
        symptoms: symptoms || '',
        notes: notes || '',
        status: 'Upcoming'
      }
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getAppointments = async (req, res) => {
  try {
    const userId = req.user.userId;
    const patientId = await getPatientIdByUserId(userId);
    if (!patientId) return res.status(200).json({ success: true, appointments: [] });

    const rows = await sequelize.query(
      `SELECT
         a.id,
         DATE(a.time) AS date,
         TIME(a.time) AS time,
         a.status,
         a.\`condition\` AS symptoms,
         d.specifications AS department,
         cr.name AS room,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username) AS doctor
       FROM APPOINTMENT a
       JOIN DOCTOR d ON d.doctor_id = a.doctor_id
       JOIN ACCOUNT acc ON acc.user_id = d.user_id
       JOIN USER u ON u.id = d.user_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       WHERE a.patient_id = :patientId
       ORDER BY a.time DESC`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    );
    const appointments = rows.map((r) => ({
      ...r,
      status:
        r.status === 'completed'
          ? 'Done'
          : r.status === 'cancelled'
            ? 'Cancelled'
            : 'Upcoming',
      notes: ''
    }));
    res.status(200).json({ success: true, appointments });
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getPatientDashboardSummary = async (req, res) => {
  try {
    const userId = req.user.userId;
    const patientId = await getPatientIdByUserId(userId);
    if (!patientId) {
      return res.json({
        success: true,
        summary: {
          nextAppointment: null,
          currentDiagnosis: null,
          activePrescriptions: 0,
          labResults: 0
        },
        activePrescriptionsList: [],
        upcomingAppointments: []
      });
    }

    const [nextRows, diagnosisRows, rxCountRows, labCountRows, medicationRows, upcomingRows] = await Promise.all([
      sequelize.query(
        `SELECT
           a.id,
           DATE(a.time) AS date,
           TIME(a.time) AS time,
           d.specifications AS department,
           cr.name AS room,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username) AS doctor
         FROM APPOINTMENT a
         JOIN DOCTOR d ON d.doctor_id = a.doctor_id
         JOIN USER u ON u.id = d.user_id
         JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
         WHERE a.patient_id = :patientId
           AND a.status = 'scheduled'
           AND a.time >= NOW()
         ORDER BY a.time ASC
         LIMIT 1`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT dis.icd_code AS icd10, dis.description AS interpretation
         FROM TREATMENT t
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DISEASE dis ON dis.id = r.disease_id
         WHERE r.patient_id = :patientId
         ORDER BY t.time DESC
         LIMIT 1`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(DISTINCT rx.order_id) AS cnt
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :patientId`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(DISTINCT tst.id) AS cnt
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :patientId`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           rx.order_id,
           rx.time,
           pd.no,
           m.name,
           pd.\`usage\` AS frequency,
           pd.quantity
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId
         ORDER BY rx.time DESC, pd.no ASC`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           a.id,
           DATE(a.time) AS date,
           TIME(a.time) AS time,
           a.status,
           d.specifications AS department,
           cr.name AS room,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username) AS doctor
         FROM APPOINTMENT a
         JOIN DOCTOR d ON d.doctor_id = a.doctor_id
         JOIN USER u ON u.id = d.user_id
         JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
         WHERE a.patient_id = :patientId
           AND a.time >= NOW()
         ORDER BY a.time ASC
         LIMIT 5`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
    ]);

    const rxGroups = new Map();
    for (const row of medicationRows) {
      const oid = row.order_id;
      if (oid == null) continue;
      if (!rxGroups.has(oid)) {
        rxGroups.set(oid, {
          id: oid,
          prescribedAt: row.time,
          medications: [],
        });
      }
      if (row.name) {
        rxGroups.get(oid).medications.push({
          id: `${oid}-${row.no}`,
          name: row.name,
          frequency: row.frequency || '',
          quantity: String(row.quantity ?? ''),
        });
      }
    }
    const activePrescriptionsList = Array.from(rxGroups.values())
      .filter((g) => g.medications.length > 0)
      .sort((a, b) => new Date(b.prescribedAt) - new Date(a.prescribedAt));

    res.json({
      success: true,
      summary: {
        nextAppointment: nextRows[0] || null,
        currentDiagnosis: diagnosisRows[0] || null,
        activePrescriptions: Number(rxCountRows?.[0]?.cnt || 0),
        labResults: Number(labCountRows?.[0]?.cnt || 0),
      },
      activePrescriptionsList,
      upcomingAppointments: (upcomingRows || []).map((r) => ({
        ...r,
        status:
          r.status === 'completed'
            ? 'Done'
            : r.status === 'cancelled'
              ? 'Cancelled'
              : 'Upcoming',
      })),
    });
  } catch (error) {
    console.error('Get patient dashboard summary error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const patientId = await getPatientIdByUserId(userId);
    if (!patientId) {
      return res.status(404).json({ message: 'Patient profile not found' });
    }
    const own = await sequelize.query(
      'SELECT id FROM APPOINTMENT WHERE id = :id AND patient_id = :patientId LIMIT 1',
      { replacements: { id, patientId }, type: QueryTypes.SELECT }
    );
    if (!own[0]) {
      return res.status(404).json({ message: 'Appointment not found or access denied' });
    }
    const statusMap = {
      Cancelled: 'cancelled',
      Done: 'completed',
      Upcoming: 'scheduled',
      Confirmed: 'scheduled',
      Pending: 'scheduled',
      Rejected: 'cancelled'
    };
    const nextStatus = req.body.status ? (statusMap[req.body.status] || String(req.body.status).toLowerCase()) : null;
    if (nextStatus) {
      await sequelize.query(
        'UPDATE APPOINTMENT SET status = :status WHERE id = :id',
        { replacements: { id, status: nextStatus }, type: QueryTypes.UPDATE }
      );
    }
    res.status(200).json({ success: true, appointment: { id: Number(id), status: req.body.status || 'Upcoming' } });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const patientId = await getPatientIdByUserId(userId);
    const own = await sequelize.query(
      'SELECT id FROM APPOINTMENT WHERE id = :id AND patient_id = :patientId LIMIT 1',
      { replacements: { id, patientId }, type: QueryTypes.SELECT }
    );
    if (!own[0]) {
      return res.status(404).json({ message: 'Appointment not found or access denied' });
    }
    await sequelize.query(
      "UPDATE APPOINTMENT SET status = 'cancelled' WHERE id = :id",
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    res.status(200).json({ success: true, message: 'Appointment deleted successfully' });
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};
