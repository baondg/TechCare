const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

// Helper: get doctor_id and specifications from user_id
async function getDoctorInfo(userId) {
  const rows = await sequelize.query(
    `SELECT d.doctor_id, d.specifications, d.user_id,
            COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), a.username) AS doctorName
     FROM DOCTOR d
     JOIN USER u ON u.id = d.user_id
     JOIN ACCOUNT a ON a.user_id = d.user_id
     WHERE d.user_id = :userId
     LIMIT 1`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

// Helper: create a notification
async function createNotification(userId, title, message, type, relatedId = null) {
  try {
    await sequelize.query(
      `INSERT INTO NOTIFICATION (user_id, title, message, type, is_read, related_id, created_at)
       VALUES (:userId, :title, :message, :type, 0, :relatedId, NOW())`,
      {
        replacements: { userId, title, message, type, relatedId },
        type: QueryTypes.INSERT,
      }
    );
  } catch (e) {
    console.error('Failed to create notification:', e.message);
  }
}

/**
 * POST /api/cover/request
 * Doctor creates a cover request for one or more of their appointments
 * Body: { appointmentIds: number[], reason: string }
 */
exports.createCoverRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { appointmentIds, reason } = req.body;

    if (!Array.isArray(appointmentIds) || appointmentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'appointmentIds array is required' });
    }

    const doctorInfo = await getDoctorInfo(userId);
    if (!doctorInfo) {
      return res.status(400).json({ success: false, message: 'Doctor profile not found' });
    }

    const created = [];
    for (const appointmentId of appointmentIds) {
      // Verify doctor owns this appointment
      const [appt] = await sequelize.query(
        `SELECT id FROM APPOINTMENT WHERE id = :id AND doctor_id = :doctorId AND status = 'scheduled' LIMIT 1`,
        { replacements: { id: appointmentId, doctorId: doctorInfo.doctor_id }, type: QueryTypes.SELECT }
      );
      if (!appt) continue;

      const [insertId] = await sequelize.query(
        `INSERT INTO COVER_REQUEST (original_doctor_id, appointment_id, status, reason, created_at)
         VALUES (:doctorId, :appointmentId, 'pending', :reason, NOW())`,
        {
          replacements: { doctorId: doctorInfo.doctor_id, appointmentId, reason: reason || 'On leave' },
          type: QueryTypes.INSERT,
        }
      );
      created.push({ id: insertId, appointmentId });
    }

    // Notify same-specialty doctors
    const sameDeptDoctors = await sequelize.query(
      `SELECT d.user_id
       FROM DOCTOR d
       WHERE d.specifications = :spec AND d.doctor_id != :doctorId`,
      { replacements: { spec: doctorInfo.specifications, doctorId: doctorInfo.doctor_id }, type: QueryTypes.SELECT }
    );

    for (const doc of sameDeptDoctors) {
      await createNotification(
        doc.user_id,
        'Cover Request',
        `Dr. ${doctorInfo.doctorName} is requesting cover for ${created.length} appointment(s). Reason: ${reason || 'On leave'}`,
        'cover_request',
        created[0]?.id || null
      );
    }

    return res.status(201).json({ success: true, coverRequests: created });
  } catch (error) {
    console.error('Create cover request error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/cover/requests
 * Get pending cover requests for the same specialty as the current doctor
 */
exports.getCoverRequests = async (req, res) => {
  try {
    const userId = req.user.userId;
    const doctorInfo = await getDoctorInfo(userId);
    if (!doctorInfo) {
      return res.json({ success: true, coverRequests: [] });
    }

    const rows = await sequelize.query(
      `SELECT
         cr.id,
         cr.appointment_id AS appointmentId,
         cr.status,
         cr.reason,
         cr.created_at AS createdAt,
         DATE(a.time) AS appointmentDate,
         TIME(a.time) AS appointmentTime,
         a.\`condition\` AS appointmentCondition,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(ou.first_name,''), ' ', COALESCE(ou.last_name,''))), ''), oa.username) AS originalDoctorName,
         COALESCE(NULLIF(TRIM(dep_appt.name), ''), NULLIF(TRIM(od.specifications), ''), '') AS department,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(pu.first_name,''), ' ', COALESCE(pu.last_name,''))), ''), 'Patient') AS patientName,
         cr2.name AS roomName
       FROM COVER_REQUEST cr
       JOIN DOCTOR od ON od.doctor_id = cr.original_doctor_id
       JOIN USER ou ON ou.id = od.user_id
       JOIN ACCOUNT oa ON oa.user_id = od.user_id
       JOIN APPOINTMENT a ON a.id = cr.appointment_id
       LEFT JOIN PATIENT p ON p.patient_id = a.patient_id
       LEFT JOIN USER pu ON pu.id = p.user_id
       LEFT JOIN CLINIC_ROOM cr2 ON cr2.id = a.room_id
       LEFT JOIN DEPARTMENT dep_appt ON dep_appt.id = cr2.department_id
       WHERE cr.status = 'pending'
         AND od.specifications = :spec
         AND cr.original_doctor_id != :myDoctorId
       ORDER BY a.time ASC`,
      { replacements: { spec: doctorInfo.specifications, myDoctorId: doctorInfo.doctor_id }, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, coverRequests: rows });
  } catch (error) {
    console.error('Get cover requests error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/cover/my-requests
 * Get cover requests created by the current doctor
 */
exports.getMyCoverRequests = async (req, res) => {
  try {
    const userId = req.user.userId;
    const doctorInfo = await getDoctorInfo(userId);
    if (!doctorInfo) {
      return res.json({ success: true, coverRequests: [] });
    }

    const rows = await sequelize.query(
      `SELECT
         cr.id,
         cr.appointment_id AS appointmentId,
         cr.status,
         cr.reason,
         cr.created_at AS createdAt,
         DATE(a.time) AS appointmentDate,
         TIME(a.time) AS appointmentTime,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(cu.first_name,''), ' ', COALESCE(cu.last_name,''))), ''), 'Pending') AS coverDoctorName
       FROM COVER_REQUEST cr
       JOIN APPOINTMENT a ON a.id = cr.appointment_id
       LEFT JOIN DOCTOR cd ON cd.doctor_id = cr.cover_doctor_id
       LEFT JOIN USER cu ON cu.id = cd.user_id
       WHERE cr.original_doctor_id = :doctorId
       ORDER BY cr.created_at DESC`,
      { replacements: { doctorId: doctorInfo.doctor_id }, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, coverRequests: rows });
  } catch (error) {
    console.error('Get my cover requests error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PUT /api/cover/:id/accept
 * Cover doctor accepts the request
 */
exports.acceptCoverRequest = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const userId = req.user.userId;
    const coverId = Number(req.params.id);
    const doctorInfo = await getDoctorInfo(userId);

    if (!doctorInfo) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Doctor profile not found' });
    }

    // Get the cover request
    const [cr] = await sequelize.query(
      `SELECT cr.*, od.user_id AS originalDoctorUserId, a.patient_id
       FROM COVER_REQUEST cr
       JOIN DOCTOR od ON od.doctor_id = cr.original_doctor_id
       JOIN APPOINTMENT a ON a.id = cr.appointment_id
       WHERE cr.id = :id AND cr.status = 'pending'
       LIMIT 1`,
      { replacements: { id: coverId }, type: QueryTypes.SELECT, transaction }
    );

    if (!cr) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Cover request not found or already handled' });
    }

    // Update cover request
    await sequelize.query(
      `UPDATE COVER_REQUEST SET status = 'accepted', cover_doctor_id = :coverDoctorId, updated_at = NOW()
       WHERE id = :id`,
      { replacements: { id: coverId, coverDoctorId: doctorInfo.doctor_id }, type: QueryTypes.UPDATE, transaction }
    );

    // Update appointment to new doctor
    await sequelize.query(
      `UPDATE APPOINTMENT SET doctor_id = :newDoctorId WHERE id = :appointmentId`,
      { replacements: { newDoctorId: doctorInfo.doctor_id, appointmentId: cr.appointment_id }, type: QueryTypes.UPDATE, transaction }
    );

    // Notify original doctor
    await createNotification(
      cr.originalDoctorUserId,
      'Cover Accepted',
      `Dr. ${doctorInfo.doctorName} has accepted to cover your appointment #${cr.appointment_id}.`,
      'cover_accepted',
      coverId
    );

    // Notify patient
    if (cr.patient_id) {
      const [patientUser] = await sequelize.query(
        `SELECT user_id FROM PATIENT WHERE patient_id = :patientId LIMIT 1`,
        { replacements: { patientId: cr.patient_id }, type: QueryTypes.SELECT, transaction }
      );
      if (patientUser) {
        await createNotification(
          patientUser.user_id,
          'Doctor Change',
          `Your appointment has been reassigned to Dr. ${doctorInfo.doctorName}. The time and location remain the same.`,
          'appointment_rescheduled',
          cr.appointment_id
        );
      }
    }

    await transaction.commit();
    return res.json({ success: true, message: 'Cover request accepted' });
  } catch (error) {
    await transaction.rollback();
    console.error('Accept cover request error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PUT /api/cover/:id/reject
 * Cover doctor rejects the request
 */
exports.rejectCoverRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const coverId = Number(req.params.id);

    const [cr] = await sequelize.query(
      `SELECT cr.*, od.user_id AS originalDoctorUserId
       FROM COVER_REQUEST cr
       JOIN DOCTOR od ON od.doctor_id = cr.original_doctor_id
       WHERE cr.id = :id AND cr.status = 'pending'
       LIMIT 1`,
      { replacements: { id: coverId }, type: QueryTypes.SELECT }
    );

    if (!cr) {
      return res.status(404).json({ success: false, message: 'Cover request not found or already handled' });
    }

    const doctorInfo = await getDoctorInfo(userId);

    // We don't change the status to rejected for a single doctor; only mark as rejected if ALL doctors reject.
    // For simplicity, we'll just notify the original doctor.
    await createNotification(
      cr.originalDoctorUserId,
      'Cover Rejected',
      `Dr. ${doctorInfo?.doctorName || 'A colleague'} has declined your cover request for appointment #${cr.appointment_id}.`,
      'cover_rejected',
      coverId
    );

    return res.json({ success: true, message: 'Cover request rejected' });
  } catch (error) {
    console.error('Reject cover request error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};
