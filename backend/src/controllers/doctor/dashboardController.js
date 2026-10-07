const { QueryTypes } = require('sequelize');
const sequelize = require('../../common/database');
const logger = require('../../common/logger');

// ═══════════════════════════════════════════════
//  DOCTOR DASHBOARD
// ═══════════════════════════════════════════════

exports.getDashboardSummary = async (req, res) => {
  try {
    if (req.user.role === 'technician') {
      const techRows = await sequelize.query(
        'SELECT technician_id FROM TECHNICIAN WHERE user_id = :userId LIMIT 1',
        { replacements: { userId: req.user.userId }, type: QueryTypes.SELECT }
      );
      const technicianId = techRows[0]?.technician_id ?? null;

      const [
        labAllTodayRows,
        myLabsTodayRows,
        pendingInputRows,
        queueRows,
        recentPatientRows,
      ] = await Promise.all([
        sequelize.query(
          `SELECT COUNT(*) AS cnt FROM TEST WHERE DATE(time) = CURDATE()`,
          { type: QueryTypes.SELECT }
        ),
        technicianId
          ? sequelize.query(
              `SELECT COUNT(DISTINCT tst.id) AS cnt
               FROM TEST tst
               LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
               WHERE DATE(tst.time) = CURDATE()
                 AND (tst.technician_id = :tid OR p.technician_id = :tid)`,
              { replacements: { tid: technicianId }, type: QueryTypes.SELECT }
            )
          : Promise.resolve([{ cnt: 0 }]),
        sequelize.query(
          `SELECT COUNT(*) AS cnt
           FROM TEST tst
           WHERE DATE(tst.time) = CURDATE()
             AND (tst.attachment_url IS NULL OR TRIM(COALESCE(tst.attachment_url, '')) = '')
             AND (tst.result IS NULL OR TRIM(COALESCE(tst.result, '')) = '')`,
          { type: QueryTypes.SELECT }
        ),
        sequelize.query(
          `SELECT
             tst.id AS labId,
             tst.type AS testType,
             tst.time AS testTime,
             tst.result AS labResult,
             tst.attachment_url AS attachmentUrl,
             r.patient_id AS patientId,
             COALESCE(
               NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
               acc.username,
               CONCAT('patient#', r.patient_id)
             ) AS patientName
           FROM TEST tst
           JOIN \`ORDER\` o ON o.id = tst.id
           JOIN TREATMENT t ON t.id = o.treatment_id
           JOIN REGIMEN r ON r.id = t.regimen_id
           JOIN USER u ON u.id = r.patient_id
           LEFT JOIN ACCOUNT acc ON acc.user_id = r.patient_id
           WHERE DATE(tst.time) = CURDATE()
           ORDER BY tst.time DESC
           LIMIT 12`,
          { type: QueryTypes.SELECT }
        ),
        sequelize.query(
          `SELECT
             r.patient_id AS patientId,
             COALESCE(
               NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
               acc.username,
               CONCAT('patient#', r.patient_id)
             ) AS patientName,
             MAX(tst.time) AS lastTime
           FROM TEST tst
           JOIN \`ORDER\` o ON o.id = tst.id
           JOIN TREATMENT t ON t.id = o.treatment_id
           JOIN REGIMEN r ON r.id = t.regimen_id
           JOIN USER u ON u.id = r.patient_id
           LEFT JOIN ACCOUNT acc ON acc.user_id = r.patient_id
           GROUP BY r.patient_id, patientName
           ORDER BY lastTime DESC
           LIMIT 8`,
          { type: QueryTypes.SELECT }
        ),
      ]);

      const toUiStatus = (row) => {
        const hasAttachment = row.attachmentUrl && String(row.attachmentUrl).trim().length > 0;
        const hasResult = row.labResult && String(row.labResult).trim().length > 0;
        return hasAttachment || hasResult ? 'Done' : 'Pending';
      };

      return res.json({
        success: true,
        summary: {
          appointmentsToday: Number(pendingInputRows?.[0]?.cnt ?? 0),
          diagnosesToday: Number(myLabsTodayRows?.[0]?.cnt ?? 0),
          prescriptionsToday: 0,
          labTestsToday: Number(labAllTodayRows?.[0]?.cnt ?? 0),
        },
        todaysSchedule: (queueRows || []).map((r) => {
          const d = r.testTime ? new Date(r.testTime) : null;
          return {
            id: Number(r.labId),
            date: d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '',
            time: d && !Number.isNaN(d.getTime()) ? d.toTimeString().slice(0, 8) : '',
            department: String(r.testType || ''),
            room: '',
            patientId: Number(r.patientId),
            patientName: String(r.patientName || ''),
            status: toUiStatus(r),
          };
        }),
        recentPatients: (recentPatientRows || []).map((r) => ({
          patientId: Number(r.patientId),
          patientName: String(r.patientName || ''),
          lastTime: r.lastTime,
        })),
      });
    }

    const doctorUserId = req.user.userId;
    const doctorRows = await sequelize.query(
      'SELECT doctor_id FROM DOCTOR WHERE user_id = :userId LIMIT 1',
      { replacements: { userId: doctorUserId }, type: QueryTypes.SELECT }
    );
    const doctorId = doctorRows[0]?.doctor_id;
    if (!doctorId) {
      return res.json({
        success: true,
        summary: {
          appointmentsToday: 0,
          diagnosesToday: 0,
          prescriptionsToday: 0,
          labTestsToday: 0,
        },
        todaysSchedule: [],
        recentPatients: [],
      });
    }

    const [
      apptCountRows,
      diagCountRows,
      rxCountRows,
      labCountRows,
      scheduleRows,
      recentRows,
    ] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*) AS cnt
         FROM APPOINTMENT a
         WHERE a.doctor_id = :doctorId
           AND DATE(a.time) = CURDATE()
           AND a.status <> 'cancelled'`,
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(*) AS cnt
         FROM TREATMENT t
         WHERE t.doctor_id = :doctorId
           AND DATE(t.time) = CURDATE()`,
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(DISTINCT rx.order_id) AS cnt
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         WHERE t.doctor_id = :doctorId
           AND DATE(rx.time) = CURDATE()`,
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(DISTINCT tst.id) AS cnt
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         WHERE t.doctor_id = :doctorId
           AND DATE(tst.time) = CURDATE()`,
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           a.id,
           DATE(a.time) AS date,
           TIME(a.time) AS time,
           a.status AS dbStatus,
           COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department,
           cr.name AS room,
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
           AND DATE(a.time) = CURDATE()
           AND a.status <> 'cancelled'
         ORDER BY a.time ASC
         LIMIT 8`,
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT DISTINCT
           p.patient_id AS patientId,
           p.user_id AS userId,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('patient#', p.user_id)) AS patientName,
           MAX(a.time) AS lastTime
         FROM APPOINTMENT a
         JOIN PATIENT p ON p.patient_id = a.patient_id
         JOIN USER u ON u.id = p.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = p.user_id
         WHERE a.doctor_id = :doctorId
         GROUP BY p.patient_id, p.user_id, patientName
         ORDER BY lastTime DESC
         LIMIT 5`,
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      ),
    ]);

    const toUiStatus = (dbStatus) =>
      dbStatus === 'completed' ? 'Done' : dbStatus === 'cancelled' ? 'Cancelled' : 'Pending';

    res.json({
      success: true,
      summary: {
        appointmentsToday: Number(apptCountRows?.[0]?.cnt || 0),
        diagnosesToday: Number(diagCountRows?.[0]?.cnt || 0),
        prescriptionsToday: Number(rxCountRows?.[0]?.cnt || 0),
        labTestsToday: Number(labCountRows?.[0]?.cnt || 0),
      },
      todaysSchedule: (scheduleRows || []).map((r) => ({
        id: r.id,
        date: r.date,
        time: r.time,
        department: r.department || '',
        room: r.room || '',
        patientId: Number(r.patientId),
        userId: Number(r.userId),
        patientName: r.patientName,
        status: toUiStatus(r.dbStatus),
      })),
      recentPatients: (recentRows || []).map((r) => ({
        patientId: Number(r.patientId),
        userId: Number(r.userId),
        patientName: r.patientName,
        lastTime: r.lastTime,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, 'Get dashboard summary error');
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
