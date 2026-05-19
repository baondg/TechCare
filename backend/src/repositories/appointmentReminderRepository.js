const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

async function selectTomorrowsConfirmedPatientAppointments() {
  return sequelize.query(
    `SELECT
       a.id AS appointmentId,
       a.patient_id AS patientId,
       pu.id AS userId,
       DATE_FORMAT(a.time, '%d/%m/%Y') AS dateVi,
       DATE_FORMAT(a.time, '%H:%i') AS timeVi,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name,''),' ',COALESCE(du.last_name,''))), ''), dacc.username) AS doctorLabel,
       COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department
     FROM APPOINTMENT a
     INNER JOIN PATIENT p ON p.patient_id = a.patient_id
     INNER JOIN USER pu ON pu.id = p.user_id
     INNER JOIN DOCTOR d ON d.doctor_id = a.doctor_id
     INNER JOIN ACCOUNT dacc ON dacc.user_id = d.user_id
     INNER JOIN USER du ON du.id = d.user_id
     LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
     LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
     WHERE a.patient_id IS NOT NULL
       AND a.status = 'scheduled'
       AND COALESCE(a.doctor_confirmed, 1) = 1
       AND DATE(a.time) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
    { type: QueryTypes.SELECT }
  );
}

async function hasAppointmentReminderToday(userId, type, likeMarkerSuffix) {
  const [row] = await sequelize.query(
    `SELECT id FROM NOTIFICATION
     WHERE user_id = :userId
       AND type = :type
       AND DATE(\`time\`) = CURDATE()
       AND content LIKE :likeMarker
     LIMIT 1`,
    {
      replacements: {
        userId,
        type,
        likeMarker: `%${likeMarkerSuffix}`,
      },
      type: QueryTypes.SELECT,
    }
  );
  return Boolean(row);
}

async function insertAppointmentReminderAtHour({ type, content, hour, userId }) {
  await sequelize.query(
    `INSERT INTO NOTIFICATION (\`type\`, content, \`time\`, status, user_id)
     VALUES (:type, :content, TIMESTAMP(DATE(NOW()), MAKETIME(:hour, 0, 0)), 'unread', :userId)`,
    {
      replacements: {
        type,
        content,
        hour,
        userId,
      },
      type: QueryTypes.INSERT,
    }
  );
}

module.exports = {
  selectTomorrowsConfirmedPatientAppointments,
  hasAppointmentReminderToday,
  insertAppointmentReminderAtHour,
};
