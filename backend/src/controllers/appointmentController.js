const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');
const { selectPrescriptionRowsWithDurationFallback } = require('../common/prescriptionQueryCompat');
const {
  notifyDoctorPatientBooked,
  notifyDoctorPatientCancelledAppointment,
  notifyDoctorsAfterNurseReschedule,
  notifyPatientAppointmentDoctorReassigned,
  notifyDoctorsAfterPatientReschedule,
  notifyDoctorReceivedCoverAppointment,
} = require('../services/appointmentNotifications');
const cacheService = require('../services/cacheService');
const APPOINTMENTS_LIST_CACHE_TTL_SECONDS = Number(process.env.APPOINTMENTS_LIST_CACHE_TTL_SECONDS || 5);
const APPOINTMENTS_READMODEL_CACHE_TTL_SECONDS = Number(process.env.APPOINTMENTS_READMODEL_CACHE_TTL_SECONDS || 30);

const normalizeDoctorInput = (value) => String(value || '').replace(/^Dr\.\s*/i, '').trim();

function parseNursePatientId(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(/^OP0*/i, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** EMR / nurse URLs use OP… or a number that may be USER.id or PATIENT.patient_id — return canonical patient_id PK. */
async function resolveNursePatientPkFromNumeric(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  const [row] = await sequelize.query(
    'SELECT patient_id AS id FROM PATIENT WHERE patient_id = :n OR user_id = :n LIMIT 1',
    { replacements: { n }, type: QueryTypes.SELECT }
  );
  return row?.id != null ? Number(row.id) : null;
}

/** Match doctor EMR: clinical diagnosis rows only (not Rx/lab/surgery/transfer treatments). */
const SQL_STANDALONE_DIAGNOSIS_ONLY = `
  AND NOT EXISTS (
    SELECT 1 FROM \`ORDER\` o
    WHERE o.treatment_id = t.id
      AND (
        EXISTS (SELECT 1 FROM SURGERY s WHERE s.id = o.id)
        OR EXISTS (SELECT 1 FROM TEST tst WHERE tst.id = o.id)
        OR EXISTS (SELECT 1 FROM MEDICAL_PRESCRIPTION rx WHERE rx.order_id = o.id)
        OR EXISTS (SELECT 1 FROM TRANSFERENCE tf WHERE tf.order_id = o.id)
      )
  )`;

function assertNurseOrAdmin(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  if (!['nurse', 'admin'].includes(role)) {
    res.status(403).json({ success: false, message: 'Forbidden' });
    return false;
  }
  return true;
}

/** Compatibility shim after PATIENT.in_dept removal. */
async function syncPatientInDeptFromAppointmentRoom(patientId, appointmentId, transaction) {
  return { patientId, appointmentId, transaction, synced: false };
}

function mapNurseCheckInRow(r) {
  // Use MySQL wall-clock parts — same idea as getAppointments (DATE/TIME). Avoid JS Date / toISOString()
  // which treat APPOINTMENT.time as UTC and shift display (e.g. VN +7: 14:00 → 21:00).
  const wallDate = r.wallDate != null ? String(r.wallDate).slice(0, 10) : '';
  const wallTimeRaw = r.wallTime != null ? String(r.wallTime).split('.')[0] : '';
  const wallTime =
    wallTimeRaw.length >= 8 ? wallTimeRaw.slice(0, 8) : wallTimeRaw.length === 5 ? `${wallTimeRaw}:00` : wallTimeRaw;
  const timeDisplay = wallTime.length >= 5 ? wallTime.slice(0, 5) : '';
  const slotTime =
    wallDate && wallTime ? `${wallDate}T${wallTime}` : r.slotTime != null ? String(r.slotTime) : '';

  return {
    id: Number(r.id),
    slotTime,
    timeDisplay,
    dateDisplay: wallDate,
    doctorId: Number(r.doctorId),
    doctorName: r.doctorName || '',
    department: r.department || '',
    roomId: r.roomId != null ? Number(r.roomId) : null,
    roomName: r.roomName || '',
    condition: r.conditionNote || '',
  };
}

/** Disease for a new nurse visit regimen: last visit’s disease, else Z00.0 (created if missing). */
async function getDefaultDiseaseIdForNurseRegimen(patientId, transaction) {
  const sel = (sql, repl = {}) =>
    sequelize.query(sql, {
      replacements: repl,
      type: QueryTypes.SELECT,
      ...(transaction ? { transaction } : {}),
    });

  const latestRows = await sel(
    `SELECT r.disease_id AS diseaseId
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE r.patient_id = :patientId
     ORDER BY t.time DESC, t.id DESC
     LIMIT 1`,
    { patientId }
  );
  const latest = latestRows[0];
  if (latest?.diseaseId != null) return Number(latest.diseaseId);

  const zRows = await sel(`SELECT id FROM DISEASE WHERE icd_code = 'Z00.0' LIMIT 1`, {});
  const z = zRows[0];
  if (z?.id != null) return Number(z.id);

  const insertOpts = { type: QueryTypes.INSERT, ...(transaction ? { transaction } : {}) };
  const [insertId] = await sequelize.query(
    `INSERT INTO DISEASE (icd_code, description, category, symptoms)
     VALUES ('Z00.0', 'General examination', 'General', NULL)`,
    insertOpts
  );
  return Number(insertId);
}

/** Nurse check-in: visit started, end filled on check-out. */
async function insertNurseVisitRegimenOpenEnd(patientId, transaction) {
  const diseaseId = await getDefaultDiseaseIdForNurseRegimen(patientId, transaction);
  const insertOpts = {
    replacements: { patientId, diseaseId },
    type: QueryTypes.INSERT,
    ...(transaction ? { transaction } : {}),
  };
  const [regimenId] = await sequelize.query(
    `INSERT INTO REGIMEN (\`start\`, \`end\`, patient_id, disease_id)
     VALUES (NOW(), NULL, :patientId, :diseaseId)`,
    insertOpts
  );
  return Number(regimenId);
}

/** Same-process AI routes (no separate Python service required by default). */
const INTERNAL_API_BASE =
  process.env.BACKEND_INTERNAL_URL || `http://127.0.0.1:${Number(process.env.PORT) || 3000}`;
const MEDAI_CHAT_ENDPOINT =
  process.env.MEDAI_CHAT_ENDPOINT || `${INTERNAL_API_BASE}/api/ai/chat`;
const MEDAI_SYMPTOM_ENDPOINT =
  process.env.MEDAI_SYMPTOM_ENDPOINT || `${INTERNAL_API_BASE}/api/ai/symptom-analysis`;

async function getPatientIdByUserId(userId) {
  const rows = await sequelize.query(
    'SELECT patient_id FROM PATIENT WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return rows[0]?.patient_id || null;
}

function getAppointmentsListCacheKey(patientPk) {
  return `patient:appointments_list:v1:${patientPk}`;
}

function getDoctorReadModelCacheKey(doctorId) {
  return `readmodel:doctor_profile:v1:${doctorId}`;
}

function getRoomReadModelCacheKey(roomId) {
  return `readmodel:room_profile:v1:${roomId}`;
}

async function invalidatePatientCaches(patientPk) {
  const pid = Number(patientPk);
  if (!Number.isFinite(pid) || pid <= 0) return;
  // Appointment status changes should not invalidate the doctor EMR patient summary cache.
  // It causes high cache-miss rates during k6 load (patient writes) with no user-visible benefit.
  await cacheService.del(getAppointmentsListCacheKey(pid));
}

async function getDoctorReadModel(doctorId) {
  const did = Number(doctorId);
  if (!Number.isFinite(did) || did <= 0) return { doctor: '', specialty: '' };
  const key = getDoctorReadModelCacheKey(did);
  const cached = await cacheService.getJson(key);
  if (cached) return cached;
  const [row] = await sequelize.query(
    `SELECT
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username) AS doctor,
       COALESCE(NULLIF(TRIM(d.specifications), ''), '') AS specifications
     FROM DOCTOR d
     JOIN USER u ON u.id = d.user_id
     JOIN ACCOUNT acc ON acc.user_id = d.user_id
     WHERE d.doctor_id = :doctorId
     LIMIT 1`,
    { replacements: { doctorId: did }, type: QueryTypes.SELECT }
  );
  const payload = {
    doctor: row?.doctor || '',
    specialty: row?.specifications || '',
  };
  await cacheService.setJson(key, payload, APPOINTMENTS_READMODEL_CACHE_TTL_SECONDS);
  return payload;
}

async function getRoomReadModel(roomId, fallbackDepartment = '') {
  const rid = Number(roomId);
  if (!Number.isFinite(rid) || rid <= 0) return { room: '', department: fallbackDepartment || '' };
  const key = getRoomReadModelCacheKey(rid);
  const cached = await cacheService.getJson(key);
  if (cached) return cached;
  const [row] = await sequelize.query(
    `SELECT
       COALESCE(cr.name, '') AS room,
       COALESCE(NULLIF(TRIM(dep.name), ''), '') AS department
     FROM CLINIC_ROOM cr
     LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
     WHERE cr.id = :roomId
     LIMIT 1`,
    { replacements: { roomId: rid }, type: QueryTypes.SELECT }
  );
  const payload = {
    room: row?.room || '',
    department: row?.department || fallbackDepartment || '',
  };
  await cacheService.setJson(key, payload, APPOINTMENTS_READMODEL_CACHE_TTL_SECONDS);
  return payload;
}

async function doctorsShareDepartment(doctorIdA, doctorIdB, transaction) {
  if (!doctorIdA || !doctorIdB || Number(doctorIdA) === Number(doctorIdB)) return true;
  const qo = { replacements: { a: doctorIdA, b: doctorIdB }, type: QueryTypes.SELECT, ...(transaction ? { transaction } : {}) };
  const [row] = await sequelize.query(
    `SELECT 1 AS ok
     FROM DOCTOR_DEPARTMENT dd1
     INNER JOIN DOCTOR_DEPARTMENT dd2 ON dd1.department_id = dd2.department_id
     WHERE dd1.doctor_id = :a AND dd2.doctor_id = :b
     LIMIT 1`,
    qo
  );
  return !!row;
}

async function getActiveAiModel() {
  const [active] = await sequelize.query(
    `SELECT id, name, provider
     FROM AI_MODEL
     WHERE status = 'active'
     ORDER BY release_date DESC, id DESC
     LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  if (active) return active;
  const [fallback] = await sequelize.query(
    `SELECT id, name, provider
     FROM AI_MODEL
     ORDER BY id DESC
     LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  return fallback || null;
}

async function getLatestTreatmentIdByPatientId(patientId) {
  const [row] = await sequelize.query(
    `SELECT t.id
     FROM TREATMENT t
     JOIN REGIMEN r ON r.id = t.regimen_id
     WHERE r.patient_id = :patientId
     ORDER BY t.time DESC, t.id DESC
     LIMIT 1`,
    { replacements: { patientId }, type: QueryTypes.SELECT }
  );
  return row?.id || null;
}

function mapPatientFeedbackRow(r) {
  return {
    id: Number(r.id),
    userId: Number(r.userId || 0),
    content: r.content || '',
    type: r.type || 'general',
    time: r.time || null,
    status: r.status === 1 || r.status === true || r.status === '1',
    rating: Number(r.rating || 0),
    response: r.response || '',
    userName: r.userName || '',
  };
}

function calculateDisplayAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  if (Number.isNaN(birth.getTime())) return null;

  const diffMs = today - birth;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  const diffYears = today.getFullYear() - birth.getFullYear();

  if (diffDays < 30) return `${Math.max(0, diffDays)} days`;
  if (diffMonths < 24) return `${Math.max(0, diffMonths)} months`;
  return `${Math.max(0, diffYears)}`;
}

exports.getFeedbacks = async (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = await sequelize.query(
      `SELECT
         f.id,
         f.user_id AS userId,
         f.content,
         f.type,
         f.time,
         f.status,
         f.rating,
         f.response
       FROM FEEDBACK f
       WHERE f.user_id = :userId
       ORDER BY f.time DESC, f.id DESC`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      feedbacks: (rows || []).map(mapPatientFeedbackRow),
    });
  } catch (error) {
    console.error('Get feedbacks error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getVisibleFeedbacks = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         f.id,
         f.user_id AS userId,
         f.content,
         f.type,
         f.time,
         f.status,
         f.rating,
         f.response,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), a.username, CONCAT('User #', f.user_id)) AS userName
       FROM FEEDBACK f
       LEFT JOIN USER u ON u.id = f.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = f.user_id
       WHERE f.status = 1
       ORDER BY f.time DESC, f.id DESC`,
      { type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      feedbacks: (rows || []).map(mapPatientFeedbackRow),
    });
  } catch (error) {
    console.error('Get visible feedbacks error:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.createFeedback = async (req, res) => {
  try {
    const userId = req.user.userId;
    const content = String(req.body?.content || '').trim();
    const type = String(req.body?.type || 'general').trim();
    const rating = Number(req.body?.rating);

    if (!content) {
      return res.status(400).json({ success: false, message: 'Feedback content is required' });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    const [insertId] = await sequelize.query(
      `INSERT INTO FEEDBACK (user_id, content, type, rating, status)
       VALUES (:userId, :content, :type, :rating, 1)`,
      {
        replacements: { userId, content, type, rating },
        type: QueryTypes.INSERT,
      }
    );

    const [created] = await sequelize.query(
      `SELECT id, user_id AS userId, content, type, time, status, rating, response
       FROM FEEDBACK
       WHERE id = :id
       LIMIT 1`,
      { replacements: { id: insertId }, type: QueryTypes.SELECT }
    );

    res.status(201).json({
      success: true,
      feedback: mapPatientFeedbackRow(created),
    });
  } catch (error) {
    console.error('Create feedback error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getPortalPatients = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         u.id AS id,
         a.username AS username,
         u.first_name AS firstName,
         u.last_name AS lastName,
         u.sex AS gender,
         u.dob AS dob,
         COALESCE(
           (
             SELECT dep_t.name
             FROM TREATMENT t
             JOIN REGIMEN r ON r.id = t.regimen_id
             LEFT JOIN DEPARTMENT dep_t ON dep_t.id = t.dept_id
             WHERE r.patient_id = pt.patient_id
               AND t.dept_id IS NOT NULL
             ORDER BY t.time DESC, t.id DESC
             LIMIT 1
           ),
           (
             SELECT dep_a.name
             FROM APPOINTMENT a2
             JOIN CLINIC_ROOM cr2 ON cr2.id = a2.room_id
             LEFT JOIN DEPARTMENT dep_a ON dep_a.id = cr2.department_id
             WHERE a2.patient_id = pt.patient_id
             ORDER BY a2.time DESC, a2.id DESC
             LIMIT 1
           )
         ) AS inDepartment
       FROM PATIENT pt
       LEFT JOIN USER u ON u.id = pt.user_id
       LEFT JOIN ACCOUNT a ON a.user_id = u.id
       WHERE (a.type = 'PAT' OR a.user_id IS NULL)
       ORDER BY pt.patient_id DESC`,
      { type: QueryTypes.SELECT }
    );

    const uidList = (rows || []).map((p) => Number(p.id)).filter((n) => Number.isFinite(n) && n > 0);
    const pkByUid = new Map();
    await Promise.all(
      uidList.map(async (uid) => {
        const pk = await resolveNursePatientPkFromNumeric(uid);
        if (pk != null) pkByUid.set(uid, pk);
      })
    );
    const uniqPks = [...new Set([...pkByUid.values()].filter((pk) => pk != null))];
    const firstApptByPatientPk = new Map();
    if (uniqPks.length > 0) {
      const idCsv = uniqPks.map((id) => Number(id)).join(',');
      const apptRows = await sequelize.query(
        `SELECT
           a.patient_id AS patientId,
           a.id AS appointmentId,
           TIME_FORMAT(a.time, '%H:%i') AS timeHm,
           a.regimen_id AS regimenId,
           a.room_id AS roomId,
           COALESCE(cr.name, '') AS roomName
         FROM APPOINTMENT a
         LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
         WHERE DATE(a.time) = CURDATE()
           AND a.status = 'scheduled'
           AND a.patient_id IN (${idCsv})
         ORDER BY a.patient_id ASC, a.time ASC, a.id ASC`,
        { type: QueryTypes.SELECT }
      );
      for (const ar of apptRows || []) {
        const pid = Number(ar.patientId);
        if (!Number.isFinite(pid)) continue;
        if (!firstApptByPatientPk.has(pid)) firstApptByPatientPk.set(pid, ar);
      }
    }

    const patients = await Promise.all((rows || []).map(async (p) => {
      const uid = Number(p.id);
      const patientPk = pkByUid.get(uid) ?? null;
      let latestDiagnosis = null;
      if (patientPk) {
        const drows = await sequelize.query(
          `SELECT
             dis.icd_code AS icd10,
             dis.description AS interpretation,
             t.time AS visitTime,
             COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name, ''), ' ', COALESCE(du.last_name, ''))), ''), da.username, CONCAT('doctor#', d.user_id)) AS doctorName
           FROM TREATMENT t
           JOIN REGIMEN r ON r.id = t.regimen_id
           LEFT JOIN DISEASE dis ON dis.id = r.disease_id
           LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
           LEFT JOIN USER du ON du.id = d.user_id
           LEFT JOIN ACCOUNT da ON da.user_id = d.user_id
           WHERE r.patient_id = :patientPk
           ${SQL_STANDALONE_DIAGNOSIS_ONLY}
           ORDER BY t.time DESC
           LIMIT 1`,
          { replacements: { patientPk }, type: QueryTypes.SELECT }
        );
        latestDiagnosis = drows[0] || null;
      }

      const age = calculateDisplayAge(p.dob);

      const ap = patientPk != null ? firstApptByPatientPk.get(Number(patientPk)) : null;
      const rid = ap?.regimenId != null ? Number(ap.regimenId) : null;
      const checkedIn = Number.isFinite(rid) && rid > 0;
      const todayAppointment =
        ap && ap.appointmentId != null
          ? {
              appointmentId: Number(ap.appointmentId),
              timeDisplay: ap.timeHm != null ? String(ap.timeHm).slice(0, 5) : '',
              checkedIn,
              roomId: ap.roomId != null ? Number(ap.roomId) : null,
              roomName: ap.roomName != null ? String(ap.roomName) : '',
            }
          : null;

      return {
        id: Number(p.id),
        username: p.username || '',
        firstName: p.firstName || '',
        lastName: p.lastName || '',
        gender: p.gender || null,
        age,
        latestDiagnosis: latestDiagnosis
          ? {
              icd10: latestDiagnosis.icd10 || '',
              interpretation: latestDiagnosis.interpretation || ''
            }
          : null,
        latestVisit: latestDiagnosis?.visitTime || null,
        doctor: latestDiagnosis?.doctorName || null,
        inDepartment: p.inDepartment != null ? String(p.inDepartment) : null,
        todayAppointment,
      };
    }));

    return res.json({ success: true, patients });
  } catch (error) {
    console.error('Get portal patients error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.getAiRecommendations = async (req, res) => {
  try {
    const userId = req.user.userId;
    const patientId = await getPatientIdByUserId(userId);
    if (!patientId) {
      return res.json({ success: true, recommendations: [] });
    }

    const rows = await sequelize.query(
      `SELECT
         ar.id,
         ar.time,
         ar.\`Type\` AS recType,
         ar.content,
         ar.feedback,
         ar.treatment_id AS treatmentId,
         am.name AS modelName,
         am.provider AS modelProvider
       FROM AI_RECOMMENDATION ar
       JOIN AI_MODEL am ON am.id = ar.model_id
       WHERE ar.patient_id = :patientId
       ORDER BY ar.time DESC, ar.id DESC`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    );

    const recommendations = (rows || []).map((r) => {
      return {
        id: Number(r.id),
        type: String(r.recType || 'other'),
        content: String(r.content || ''),
        time: r.time || null,
        modelName: r.modelName || '',
        modelProvider: r.modelProvider || '',
        treatmentId: r.treatmentId ?? null,
        feedback: r.feedback || null,
      };
    });

    return res.json({ success: true, recommendations });
  } catch (error) {
    console.error('Get AI recommendations error:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.updateAiRecommendationFeedback = async (req, res) => {
  try {
    const userId = req.user.userId;
    const patientId = await getPatientIdByUserId(userId);
    const id = Number(req.params.id);
    const feedback = String(req.body?.feedback || '').trim();

    if (!patientId) return res.status(404).json({ success: false, message: 'Patient profile not found' });
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid recommendation id' });
    if (!feedback) return res.status(400).json({ success: false, message: 'Feedback is required' });

    const [exists] = await sequelize.query(
      `SELECT ar.id
       FROM AI_RECOMMENDATION ar
       WHERE ar.id = :id AND ar.patient_id = :patientId
       LIMIT 1`,
      { replacements: { id, patientId }, type: QueryTypes.SELECT }
    );
    if (!exists) return res.status(404).json({ success: false, message: 'Recommendation not found' });

    await sequelize.query(
      `UPDATE AI_RECOMMENDATION
       SET feedback = :feedback
       WHERE id = :id`,
      { replacements: { id, feedback }, type: QueryTypes.UPDATE }
    );

    return res.json({ success: true, id, feedback });
  } catch (error) {
    console.error('Update AI recommendation feedback error:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.chatWithAiAndSave = async (req, res) => {
  try {
    const userId = req.user.userId;
    const patientId = await getPatientIdByUserId(userId);
    if (!patientId) return res.status(404).json({ success: false, message: 'Patient profile not found' });

    const userMessage = String(req.body?.userMessage || '').trim();
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!userMessage) {
      return res.status(400).json({ success: false, message: 'userMessage is required' });
    }

    const model = await getActiveAiModel();
    if (!model?.id) {
      return res.status(400).json({ success: false, message: 'No AI model configured in AI_MODEL table' });
    }

    const payload = {
      messages: [...messages.filter((m) => m && m.role && m.content), { role: 'user', content: userMessage }],
    };

    let aiResp;
    try {
      aiResp = await fetch(MEDAI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (upstreamError) {
      return res.status(502).json({
        success: false,
        message: `Cannot connect to AI service at ${MEDAI_CHAT_ENDPOINT}`,
        error: upstreamError?.message || 'Unknown upstream error',
      });
    }

    const aiData = await aiResp.json().catch(() => ({}));
    if (!aiResp.ok) {
      return res.status(502).json({
        success: false,
        message: aiData?.message || aiData?.error || 'AI service returned an error',
      });
    }
    const reply = String(aiData.reply || aiData.message || '').trim();
    if (!reply) {
      return res.status(502).json({ success: false, message: 'AI chatbot returned empty response' });
    }
    const aiFallback = Boolean(aiData.fallback);
    const aiHint = aiFallback ? String(aiData.hint || '').trim() : '';

    const now = new Date();
    const treatmentId = await getLatestTreatmentIdByPatientId(patientId);

    await sequelize.query(
      `INSERT INTO CHAT_TURN (question, ask_time, response, rep_time, patient_id, model_id)
       VALUES (:question, :askTime, :response, :repTime, :patientId, :modelId)`,
      {
        replacements: {
          question: userMessage,
          askTime: now,
          response: reply,
          repTime: now,
          patientId,
          modelId: model.id,
        },
        type: QueryTypes.INSERT,
      }
    );

    const [recommendationId] = await sequelize.query(
      `INSERT INTO AI_RECOMMENDATION (time, model_id, \`Type\`, content, treatment_id, patient_id)
       VALUES (:time, :modelId, :type, :content, :treatmentId, :patientId)`,
      {
        replacements: {
          time: now,
          modelId: model.id,
          type: 'chatbot',
          content: reply,
          treatmentId,
          patientId,
        },
        type: QueryTypes.INSERT,
      }
    );

    return res.json({
      success: true,
      message: reply,
      recommendationId: Number(recommendationId),
      model: { id: Number(model.id), name: model.name || '', provider: model.provider || '' },
      aiFallback,
      aiHint: aiHint || undefined,
    });
  } catch (error) {
    console.error('chatWithAiAndSave error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.analyzeSymptomsAndSave = async (req, res) => {
  try {
    const userId = req.user.userId;
    const patientId = await getPatientIdByUserId(userId);
    if (!patientId) return res.status(404).json({ success: false, message: 'Patient profile not found' });

    const symptoms = Array.isArray(req.body?.symptoms) ? req.body.symptoms : [];
    if (!symptoms.length) {
      return res.status(400).json({ success: false, message: 'symptoms is required' });
    }

    const model = await getActiveAiModel();
    if (!model?.id) {
      return res.status(400).json({ success: false, message: 'No AI model configured in AI_MODEL table' });
    }

    let aiResp;
    try {
      aiResp = await fetch(MEDAI_SYMPTOM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms }),
      });
    } catch (upstreamError) {
      return res.status(502).json({
        success: false,
        message: `Cannot reach symptom analysis service (${MEDAI_SYMPTOM_ENDPOINT})`,
        error: upstreamError?.message || 'Network error',
      });
    }
    const aiData = await aiResp.json().catch(() => ({}));
    if (!aiResp.ok) {
      return res.status(502).json({
        success: false,
        message:
          aiData?.error ||
          aiData?.message ||
          `Symptom analysis service error (${aiResp.status})`,
        hint: aiData?.hint,
      });
    }
    const conditions = Array.isArray(aiData.possible_conditions) ? aiData.possible_conditions : [];
    const recommendedAction = String(aiData.recommended_action || 'Please consult a healthcare professional.');
    const suggestedMedication = Array.isArray(aiData.suggested_medication_type)
      ? aiData.suggested_medication_type
      : [];

    const results = conditions.map((c) => {
      const prob = String(c.probability || '').toLowerCase();
      const severity = prob === 'high' ? 'high' : prob === 'medium' ? 'medium' : 'low';
      return {
        condition: String(c.disease || 'Unknown'),
        severity,
        recommendation: recommendedAction,
        details: String(c.reason || ''),
        possibleCauses: suggestedMedication,
        whenToSeekHelp: 'Consult a doctor if symptoms worsen or do not improve within 48 hours.',
      };
    });

    const disclaimer =
      'This is not a medical diagnosis. Always consult a qualified healthcare professional for proper evaluation and treatment.';

    const treatmentId = await getLatestTreatmentIdByPatientId(patientId);

    const [recommendationId] = await sequelize.query(
      `INSERT INTO AI_RECOMMENDATION (time, model_id, \`Type\`, content, treatment_id, patient_id)
       VALUES (:time, :modelId, :type, :content, :treatmentId, :patientId)`,
      {
        replacements: {
          time: new Date(),
          modelId: model.id,
          type: 'symptomchecker',
          content: JSON.stringify({ symptoms, possible_conditions: conditions, recommended_action: recommendedAction }),
          treatmentId,
          patientId,
        },
        type: QueryTypes.INSERT,
      }
    );

    return res.json({
      success: true,
      analysis: { results, disclaimer },
      recommendationId: Number(recommendationId),
      model: { id: Number(model.id), name: model.name || '', provider: model.provider || '' },
    });
  } catch (error) {
    console.error('analyzeSymptomsAndSave error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

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
 * Return all doctors for booking / nurse slot UI.
 * Departments come from DOCTOR_DEPARTMENT → DEPARTMENT.name (schema no longer has DOCTOR.department).
 */
function parseDoctorDepartmentSet(value) {
  if (value == null || value === '') return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

exports.getDoctors = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         d.doctor_id AS id,
         a.username,
         u.first_name AS firstName,
         u.last_name AS lastName,
         d.specifications AS specifications,
         cr.name AS room,
         dep.name AS deptName
       FROM DOCTOR d
       JOIN ACCOUNT a ON a.user_id = d.user_id
       JOIN USER u ON u.id = d.user_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = d.room_id
       LEFT JOIN DOCTOR_DEPARTMENT dd ON dd.doctor_id = d.doctor_id
       LEFT JOIN DEPARTMENT dep ON dep.id = dd.department_id
       ORDER BY u.first_name ASC, u.last_name ASC, d.doctor_id ASC, dep.name ASC`,
      { type: QueryTypes.SELECT }
    );

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

    res.json({ success: true, doctors });
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/appointments/clinic-rooms
 * Return clinic room options for appointment forms.
 */
exports.getClinicRooms = async (_req, res) => {
  try {
    const rooms = await sequelize.query(
      `SELECT
         cr.id,
         cr.name,
         cr.capacity,
         cr.department_id AS departmentId,
         dep.name AS departmentName
       FROM CLINIC_ROOM cr
       LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
       ORDER BY dep.name ASC, cr.name ASC, cr.id ASC`,
      { type: QueryTypes.SELECT }
    );
    return res.json({ success: true, rooms });
  } catch (error) {
    console.error('Get clinic rooms error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
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

/**
 * GET /api/appointments/open-slots?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Nurse view: appointment slots (both open/booked) within date range.
 */
exports.getOpenSlots = async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    const canViewForManagement = ['nurse', 'admin'].includes(role);
    const isPatientView = role === 'patient';
    if (!canViewForManagement && !isPatientView) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const startDate = String(req.query?.startDate || '').trim();
    const endDate = String(req.query?.endDate || '').trim();
    const hasStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
    const hasEnd = /^\d{4}-\d{2}-\d{2}$/.test(endDate);

    const rows = await sequelize.query(
      `SELECT
         a.id,
         DATE(a.time) AS date,
         TIME(a.time) AS time,
         a.status AS dbStatus,
         a.patient_id AS patientId,
         p.user_id AS patientUserId,
         d.doctor_id AS doctorId,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name,''), ' ', COALESCE(du.last_name,''))), ''), dacc.username) AS doctorName,
         COALESCE(
           NULLIF(TRIM(dep_room.name), ''),
           (SELECT NULLIF(TRIM(d2.name), '')
            FROM DOCTOR_DEPARTMENT dd
            INNER JOIN DEPARTMENT d2 ON d2.id = dd.department_id
            WHERE dd.doctor_id = d.doctor_id
            ORDER BY dd.department_id ASC
            LIMIT 1),
           NULLIF(TRIM(d.specifications), ''),
           ''
         ) AS department,
         a.room_id AS roomId,
         COALESCE(cr.name, '') AS roomName,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(pu.first_name,''), ' ', COALESCE(pu.last_name,''))), ''), pacc.username, '') AS patientName
       FROM APPOINTMENT a
       JOIN DOCTOR d ON d.doctor_id = a.doctor_id
       JOIN USER du ON du.id = d.user_id
       JOIN ACCOUNT dacc ON dacc.user_id = d.user_id
       LEFT JOIN PATIENT p ON p.patient_id = a.patient_id
       LEFT JOIN USER pu ON pu.id = p.user_id
       LEFT JOIN ACCOUNT pacc ON pacc.user_id = p.user_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       LEFT JOIN DEPARTMENT dep_room ON dep_room.id = cr.department_id
       WHERE (:hasStart = 0 OR DATE(a.time) >= :startDate)
         AND (:hasEnd = 0 OR DATE(a.time) <= :endDate)
         AND (:isPatientView = 0 OR (a.status <> 'cancelled' AND a.patient_id IS NULL))
       ORDER BY a.time ASC, a.id ASC`,
      {
        replacements: {
          hasStart: hasStart ? 1 : 0,
          hasEnd: hasEnd ? 1 : 0,
          startDate: hasStart ? startDate : null,
          endDate: hasEnd ? endDate : null,
          isPatientView: isPatientView ? 1 : 0,
        },
        type: QueryTypes.SELECT
      }
    );

    const slots = (rows || []).map((r) => ({
      id: Number(r.id),
      date: r.date,
      time: String(r.time || '').slice(0, 5),
      doctorId: Number(r.doctorId),
      doctorName: r.doctorName || '',
      department: r.department || '',
      roomId: r.roomId != null ? Number(r.roomId) : null,
      roomName: r.roomName || '',
      patientId: r.patientId != null ? Number(r.patientId) : null,
      patientUserId: r.patientUserId != null ? Number(r.patientUserId) : null,
      patientName: r.patientName || '',
      status: r.dbStatus === 'cancelled' ? 'cancelled' : r.patientId ? 'booked' : 'open',
    }));

    return res.json({ success: true, slots });
  } catch (error) {
    console.error('Get open slots error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/appointments/open-slots
 * Nurse creates open appointment slot.
 */
exports.createOpenSlot = async (req, res) => {
  try {
    if (!['nurse', 'admin'].includes(String(req.user.role || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const doctorId = Number(req.body?.doctorId);
    const roomId = Number(req.body?.roomId);
    const date = String(req.body?.date || '').trim();
    const time = String(req.body?.time || '').trim().slice(0, 5);
    const condition = String(req.body?.condition || 'Open slot').trim();

    if (!Number.isFinite(doctorId) || !date || !time) {
      return res.status(400).json({ success: false, message: 'doctorId, date and time are required' });
    }

    const dateTime = `${date} ${time}:00`;
    let resolvedRoomId = Number.isFinite(roomId) ? roomId : null;
    if (!resolvedRoomId) {
      const [doctorRoom] = await sequelize.query(
        'SELECT room_id FROM DOCTOR WHERE doctor_id = :doctorId LIMIT 1',
        { replacements: { doctorId }, type: QueryTypes.SELECT }
      );
      resolvedRoomId = doctorRoom?.room_id || null;
    }
    if (!resolvedRoomId) {
      const [fallback] = await sequelize.query('SELECT id FROM CLINIC_ROOM LIMIT 1', { type: QueryTypes.SELECT });
      resolvedRoomId = fallback?.id || null;
    }
    if (!resolvedRoomId) {
      return res.status(400).json({ success: false, message: 'No clinic room available' });
    }

    const [existing] = await sequelize.query(
      `SELECT id FROM APPOINTMENT
       WHERE doctor_id = :doctorId AND room_id = :roomId AND time = :dt
       LIMIT 1`,
      { replacements: { doctorId, roomId: resolvedRoomId, dt: dateTime }, type: QueryTypes.SELECT }
    );
    if (existing?.id) {
      return res.status(409).json({ success: false, message: 'This slot already exists' });
    }

    const [id] = await sequelize.query(
      `INSERT INTO APPOINTMENT (time, status, \`condition\`, patient_id, doctor_id, room_id, regimen_id)
       VALUES (:time, 'scheduled', :condition, NULL, :doctorId, :roomId, NULL)`,
      {
        replacements: { time: dateTime, condition, doctorId, roomId: resolvedRoomId },
        type: QueryTypes.INSERT
      }
    );

    return res.status(201).json({ success: true, slot: { id, doctorId, roomId: resolvedRoomId, date, time, status: 'open' } });
  } catch (error) {
    console.error('Create open slot error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * PUT /api/appointments/open-slots/:id
 * Nurse updates slot time/room; may reassign doctor (including booked slots — same department only).
 * Body: date, time (optional if unchanged — use current slot), roomId (optional), doctorId (optional).
 */
exports.updateOpenSlot = async (req, res) => {
  try {
    if (!['nurse', 'admin'].includes(String(req.user.role || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const id = Number(req.params.id);
    const dateIn = String(req.body?.date || '').trim();
    const timeIn = String(req.body?.time || '').trim().slice(0, 5);
    const roomIdRaw = req.body?.roomId;
    const hasRoomId = roomIdRaw !== undefined && roomIdRaw !== null && String(roomIdRaw).trim() !== '';
    const parsedRoomId = Number(roomIdRaw);
    const roomId = hasRoomId && Number.isFinite(parsedRoomId) ? parsedRoomId : null;
    const doctorIdIn = req.body?.doctorId != null ? Number(req.body.doctorId) : null;
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }
    const [slot] = await sequelize.query(
      `SELECT
         id,
         patient_id AS patientId,
         doctor_id AS doctorId,
         room_id AS roomId,
         time AS slotTime,
         status
       FROM APPOINTMENT WHERE id = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });
    if (String(slot.status || '').toLowerCase() === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Slot is cancelled' });
    }

    const wall = String(slot.slotTime || '');
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(wall.replace('T', ' '));
    const existingDate = m ? m[1] : '';
    const existingTime = m ? `${m[2]}:${m[3]}` : '';
    const date = dateIn || existingDate;
    const time = timeIn || existingTime;
    if (!date || !time) {
      return res.status(400).json({ success: false, message: 'date and time are required (or slot has invalid time)' });
    }

    let nextDoctorId = Number(slot.doctorId);
    if (Number.isFinite(doctorIdIn) && doctorIdIn > 0) {
      nextDoctorId = doctorIdIn;
    }

    let nextRoomId = slot.roomId != null ? Number(slot.roomId) : null;
    if (roomId !== null) nextRoomId = roomId;
    const [newDr] = await sequelize.query(
      'SELECT room_id AS roomId FROM DOCTOR WHERE doctor_id = :did LIMIT 1',
      { replacements: { did: nextDoctorId }, type: QueryTypes.SELECT }
    );
    if (nextDoctorId !== Number(slot.doctorId) && newDr?.roomId != null) {
      nextRoomId = Number(newDr.roomId);
    }

    const dateTime = `${date} ${time}:00`;
    const oldDoctorId = Number(slot.doctorId);
    const hadPatient = slot.patientId != null;

    if (hadPatient && nextDoctorId !== oldDoctorId) {
      const okDept = await doctorsShareDepartment(oldDoctorId, nextDoctorId, null);
      if (!okDept) {
        return res.status(400).json({
          success: false,
          message: 'Covering doctor must share a department with the current doctor',
        });
      }
    }

    const [conflict] = await sequelize.query(
      `SELECT id FROM APPOINTMENT
       WHERE doctor_id = :doctorId
         AND time = :dt
         AND status = 'scheduled'
         AND id <> :id
       LIMIT 1`,
      { replacements: { doctorId: nextDoctorId, dt: dateTime, id }, type: QueryTypes.SELECT }
    );
    if (conflict?.id) {
      return res.status(409).json({ success: false, message: 'That doctor already has a slot at this time' });
    }

    let oldDoctorLabel = '';
    if (nextDoctorId !== oldDoctorId) {
      const [od] = await sequelize.query(
        `SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))), ''), a.username) AS name
         FROM DOCTOR d
         JOIN USER u ON u.id = d.user_id
         JOIN ACCOUNT a ON a.user_id = d.user_id
         WHERE d.doctor_id = :did LIMIT 1`,
        { replacements: { did: oldDoctorId }, type: QueryTypes.SELECT }
      );
      oldDoctorLabel = od?.name ? `Dr. ${String(od.name).trim()}` : `Doctor #${oldDoctorId}`;
    }

    await sequelize.query(
      `UPDATE APPOINTMENT
       SET time = :time,
           doctor_id = :doctorId,
           room_id = :roomId
       WHERE id = :id`,
      {
        replacements: {
          id,
          time: dateTime,
          doctorId: nextDoctorId,
          roomId: nextRoomId,
        },
        type: QueryTypes.UPDATE,
      }
    );

    if (hadPatient && nextDoctorId !== oldDoctorId) {
      const [nd] = await sequelize.query(
        `SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))), ''), a.username) AS name
         FROM DOCTOR d
         JOIN USER u ON u.id = d.user_id
         JOIN ACCOUNT a ON a.user_id = d.user_id
         WHERE d.doctor_id = :did LIMIT 1`,
        { replacements: { did: nextDoctorId }, type: QueryTypes.SELECT }
      );
      const newDoctorLabel = nd?.name ? `Dr. ${String(nd.name).trim()}` : `Doctor #${nextDoctorId}`;
      const [depRow] = await sequelize.query(
        `SELECT COALESCE(NULLIF(TRIM(dep.name), ''), '') AS depName
         FROM APPOINTMENT a
         JOIN CLINIC_ROOM cr ON cr.id = a.room_id
         LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
         WHERE a.id = :id LIMIT 1`,
        { replacements: { id }, type: QueryTypes.SELECT }
      );
      const dateVi = date.split('-').reverse().join('/');
      const timeVi = time;
      await notifyPatientAppointmentDoctorReassigned(sequelize, {
        patientId: Number(slot.patientId),
        dateVi,
        timeVi,
        department: depRow?.depName || '',
        oldDoctorName: oldDoctorLabel,
        newDoctorName: newDoctorLabel,
      });
    }

    if (nextDoctorId !== oldDoctorId) {
      await notifyDoctorReceivedCoverAppointment(sequelize, {
        appointmentId: id,
        previousDoctorLabel: oldDoctorLabel,
      });
    }

    return res.json({ success: true, id, date, time });
  } catch (error) {
    console.error('Update open slot error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * DELETE /api/appointments/open-slots/:id
 * Nurse cancels an open slot.
 */
exports.deleteOpenSlot = async (req, res) => {
  try {
    if (!['nurse', 'admin'].includes(String(req.user.role || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    const [slot] = await sequelize.query(
      `SELECT id, patient_id AS patientId FROM APPOINTMENT WHERE id = :id LIMIT 1`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found' });
    if (slot.patientId) return res.status(400).json({ success: false, message: 'Booked slot cannot be deleted' });
    await sequelize.query(
      "UPDATE APPOINTMENT SET status = 'cancelled' WHERE id = :id",
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, id });
  } catch (error) {
    console.error('Delete open slot error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.createAppointment = async (req, res) => {
  const {
      doctor,
      department,
      date,
      time,
      room,
      symptoms,
      notes,
    rescheduleFromAppointmentId,
    rescheduleFromId,
  } = req.body;
  const userId = req.user.userId;

  if (!doctor || !department || !date || !time) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  let patientId;
  let doctorRow;
  let dateTime;
  let roomId;
  let id;

  const rescheduleFrom = Number(rescheduleFromAppointmentId ?? rescheduleFromId);
  const useReschedule = Number.isFinite(rescheduleFrom) && rescheduleFrom > 0;
  const t = useReschedule ? await sequelize.transaction() : null;
  const qopt = (o) => (t ? { ...o, transaction: t } : o);

  try {
    patientId = await getPatientIdByUserId(userId);
    if (!patientId) {
      if (t) await t.rollback();
      return res.status(400).json({ message: 'Patient profile not found' });
    }

    if (useReschedule) {
      const [fc] = await sequelize.query(
        `SELECT id, patient_id AS patientId FROM APPOINTMENT
         WHERE id = :fid AND patient_id = :patientId AND status = 'scheduled' LIMIT 1`,
        qopt({ replacements: { fid: rescheduleFrom, patientId }, type: QueryTypes.SELECT })
      );
      if (!fc) {
        await t.rollback();
        return res.status(400).json({
          message: 'Original appointment not found or cannot be rescheduled',
        });
      }
    }

    doctorRow = await getDoctorByInput(doctor);
    if (!doctorRow) {
      if (t) await t.rollback();
      return res.status(400).json({ message: 'Doctor not found' });
    }
    dateTime = `${date} ${String(time).slice(0, 8)}`;
    roomId = null;
    const normalizedRoomName = String(room || '').trim().replace(/^room\s+/i, '');
    if (normalizedRoomName) {
      const r = await sequelize.query(
        'SELECT id FROM CLINIC_ROOM WHERE name = :name LIMIT 1',
        qopt({ replacements: { name: normalizedRoomName }, type: QueryTypes.SELECT })
      );
      roomId = r[0]?.id || null;
    }
    if (!roomId) {
      roomId = doctorRow.room_id || null;
    }
    if (!roomId) {
      const fallback = await sequelize.query('SELECT id FROM CLINIC_ROOM LIMIT 1', qopt({ type: QueryTypes.SELECT }));
      roomId = fallback[0]?.id || null;
    }
    if (!roomId) {
      if (t) await t.rollback();
      return res.status(400).json({ message: 'No clinic room available to schedule appointment' });
    }
    const exists = await sequelize.query(
      `SELECT id FROM APPOINTMENT
       WHERE doctor_id = :doctorId AND room_id = :roomId AND time = :dt AND status = 'scheduled'
       LIMIT 1`,
      qopt({
        replacements: { doctorId: doctorRow.doctor_id, roomId, dt: dateTime },
        type: QueryTypes.SELECT,
      })
    );
    const existingSlot = exists[0] || null;
    if (existingSlot?.id) {
      const [slotRow] = await sequelize.query(
        'SELECT id, patient_id AS patientId FROM APPOINTMENT WHERE id = :id LIMIT 1',
        qopt({ replacements: { id: existingSlot.id }, type: QueryTypes.SELECT })
      );
      if (slotRow?.patientId) {
        if (t) await t.rollback();
        return res.status(409).json({ message: 'This time slot is already booked. Please choose another time.' });
      }
      await sequelize.query(
        `UPDATE APPOINTMENT
         SET patient_id = :patientId, \`condition\` = :condition, status = 'scheduled', doctor_confirmed = 0
         WHERE id = :id`,
        qopt({
          replacements: {
            id: existingSlot.id,
            patientId,
            condition: symptoms || notes || 'General consultation',
          },
          type: QueryTypes.UPDATE,
        })
      );
      id = existingSlot.id;
    } else {
      const [newId] = await sequelize.query(
        `INSERT INTO APPOINTMENT (time, status, \`condition\`, patient_id, doctor_id, room_id, regimen_id, doctor_confirmed)
         VALUES (:time, 'scheduled', :condition, :patientId, :doctorId, :roomId, NULL, 0)`,
        qopt({
          replacements: {
            time: dateTime,
            condition: symptoms || notes || 'General consultation',
            patientId,
            doctorId: doctorRow.doctor_id,
            roomId,
          },
          type: QueryTypes.INSERT,
        })
      );
      id = newId;
    }

    if (useReschedule) {
      if (Number(id) === rescheduleFrom) {
        await t.rollback();
        return res.status(400).json({ message: 'Choose a different time slot to reschedule' });
      }
      await sequelize.query(
        `UPDATE APPOINTMENT SET patient_id = NULL, \`condition\` = 'Open slot', doctor_confirmed = 1
         WHERE id = :fid AND patient_id = :patientId`,
        qopt({
          replacements: { fid: rescheduleFrom, patientId },
          type: QueryTypes.UPDATE,
        })
      );
      await t.commit();
      await notifyDoctorsAfterPatientReschedule(sequelize, {
        fromAppointmentId: rescheduleFrom,
        toAppointmentId: id,
        patientId,
      });
    }

    await notifyDoctorPatientBooked(sequelize, id);
    await invalidatePatientCaches(patientId);
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
        status: 'Pending',
        awaitingDoctorConfirmation: true,
      },
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error('Create appointment error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.getAppointments = async (req, res) => {
  try {
    const userId = req.user.userId;
    const [patientRow] = await sequelize.query(
      'SELECT patient_id AS patientId FROM PATIENT WHERE user_id = :userId LIMIT 1',
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    const patientId = Number(patientRow?.patientId);
    if (!Number.isFinite(patientId) || patientId <= 0) {
      return res.status(200).json({ success: true, appointments: [] });
    }
    const cacheKey = getAppointmentsListCacheKey(patientId);
    const cachedPayload = await cacheService.getJson(cacheKey);
    if (cachedPayload) {
      return res.status(200).json(cachedPayload);
    }
    const rows = await sequelize.query(
      `SELECT
         a.id,
         DATE(a.time) AS date,
         TIME(a.time) AS time,
         a.status,
         COALESCE(a.doctor_confirmed, 1) AS doctorConfirmed,
         a.\`condition\` AS symptoms,
         COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, '') AS doctorName,
         COALESCE(d.specifications, '') AS doctorSpecialty,
         COALESCE(cr.name, '') AS roomName,
         COALESCE(dep.name, '') AS roomDepartment
       FROM APPOINTMENT a
       LEFT JOIN DOCTOR d ON d.doctor_id = a.doctor_id
       LEFT JOIN USER u ON u.id = d.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
       LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
       LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
       WHERE a.patient_id = :patientId
       ORDER BY a.time DESC`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    );
    const appointments = rows.map((r) => {
      const dc = Number(r.doctorConfirmed) !== 0;
      let status;
      if (r.status === 'completed') status = 'Done';
      else if (r.status === 'cancelled') status = 'Cancelled';
      else if (!dc) status = 'Pending';
      else status = 'Upcoming';
      return {
        id: r.id,
        date: r.date,
        time: r.time,
        symptoms: r.symptoms,
        department: r.roomDepartment || r.doctorSpecialty || '',
        room: r.roomName || '',
        doctor: r.doctorName || '',
        status,
        awaitingDoctorConfirmation: r.status === 'scheduled' && !dc,
        notes: '',
      };
    });
    const payload = { success: true, appointments };
    await cacheService.setJson(cacheKey, payload, APPOINTMENTS_LIST_CACHE_TTL_SECONDS);
    res.status(200).json(payload);
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
           COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department,
           cr.name AS room,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username) AS doctor
         FROM APPOINTMENT a
         JOIN DOCTOR d ON d.doctor_id = a.doctor_id
         JOIN USER u ON u.id = d.user_id
         JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
         LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
         WHERE a.patient_id = :patientId
           AND a.status = 'scheduled'
           AND COALESCE(a.doctor_confirmed, 1) = 1
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
      selectPrescriptionRowsWithDurationFallback(
        sequelize,
        `SELECT
           rx.order_id,
           rx.time,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             acc.username,
             CONCAT('doctor#', doc.user_id)
           ) AS doctorName,
           pd.no,
           m.name,
           pd.\`usage\` AS frequency,
           pd.quantity,
           COALESCE(pd.duration, 7) AS lineDuration
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DOCTOR doc ON doc.doctor_id = t.doctor_id
         LEFT JOIN USER u ON u.id = doc.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = doc.user_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId
         ORDER BY rx.time DESC, pd.no ASC`,
        `SELECT
           rx.order_id,
           rx.time,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             acc.username,
             CONCAT('doctor#', doc.user_id)
           ) AS doctorName,
           pd.no,
           m.name,
           pd.\`usage\` AS frequency,
           pd.quantity
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DOCTOR doc ON doc.doctor_id = t.doctor_id
         LEFT JOIN USER u ON u.id = doc.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = doc.user_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId
         ORDER BY rx.time DESC, pd.no ASC`,
        { patientId }
      ),
      sequelize.query(
        `SELECT
           a.id,
           DATE(a.time) AS date,
           TIME(a.time) AS time,
           a.status,
           COALESCE(NULLIF(TRIM(dep.name), ''), NULLIF(TRIM(d.specifications), ''), '') AS department,
           cr.name AS room,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username) AS doctor
         FROM APPOINTMENT a
         JOIN DOCTOR d ON d.doctor_id = a.doctor_id
         JOIN USER u ON u.id = d.user_id
         JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
         LEFT JOIN DEPARTMENT dep ON dep.id = cr.department_id
         WHERE a.patient_id = :patientId
           AND a.status = 'scheduled'
           AND COALESCE(a.doctor_confirmed, 1) = 1
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
          doctorName: row.doctorName || '',
          medications: [],
        });
      }
      if (row.name) {
        rxGroups.get(oid).medications.push({
          id: `${oid}-${row.no}`,
          name: row.name,
          frequency: row.frequency || '',
          quantity: String(row.quantity ?? ''),
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
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

const VISIT_VITALS_WINDOW_MS = 72 * 60 * 60 * 1000;

function pickClosestVital(treatmentTime, records) {
  const t = new Date(treatmentTime).getTime();
  if (Number.isNaN(t)) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const r of records) {
    const rt = new Date(r.time).getTime();
    if (Number.isNaN(rt)) continue;
    const diff = Math.abs(rt - t);
    if (diff < bestDiff && diff <= VISIT_VITALS_WINDOW_MS) {
      bestDiff = diff;
      best = r;
    }
  }
  return best;
}

/** Vitals recorded during [regimenStart, regimenEnd] (encounter window). */
function pickVitalInRegimenWindow(records, regimenStart, regimenEnd) {
  const s = new Date(regimenStart).getTime();
  const e = new Date(regimenEnd).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  let best = null;
  let bestDist = Infinity;
  for (const r of records) {
    const rt = new Date(r.time).getTime();
    if (Number.isNaN(rt)) continue;
    if (rt < s || rt > e) continue;
    const dist = Math.abs(rt - e);
    if (dist < bestDist) {
      bestDist = dist;
      best = r;
    }
  }
  return best;
}

function mapMedicalRecordToVitals(r) {
  if (!r) return null;
  const [sys, dia] = r.blood_pressure ? String(r.blood_pressure).split('/') : ['', ''];
  const h = parseFloat(r.height) || 0;
  const w = parseFloat(r.weight) || 0;
  return {
    recordId: r.id,
    recordedAt: r.time,
    heightCm: h,
    weightKg: w,
    bmi: h > 0 ? +(w / (h / 100) ** 2).toFixed(1) : null,
    bloodPressureSys: parseInt(sys, 10) || null,
    bloodPressureDia: parseInt(dia, 10) || null,
    heartRate: r.heart_rate ?? null,
    respiratoryRate: r.respiratory_rate ?? null,
    temperature: r.temperature ?? null,
    spo2: r.spo2 ?? null,
    symptomsNote: r.condition || '',
    status: r.status || '',
  };
}

function normalizeJsonColumn(val) {
  if (val == null) return null;
  if (typeof val === 'object' && !Buffer.isBuffer(val)) return val;
  try {
    return JSON.parse(String(val));
  } catch {
    return null;
  }
}

/**
 * GET /api/appointments/medical-visits
 * Patient portal: one object per TREATMENT (visit) with diagnosis, vitals snapshot, Rx, labs, surgeries.
 */
exports.getPatientMedicalVisits = async (req, res) => {
  try {
    const userId = req.user.userId;
    const patientId = await getPatientIdByUserId(userId);
    if (!patientId) {
      return res.json({ success: true, visits: [] });
    }

    const [treatments, rxRows, labRows, surgeryRows, mrRows] = await Promise.all([
      sequelize.query(
        `SELECT
           t.id AS treatmentId,
           t.time AS visitAt,
           t.type AS department,
           t.\`condition\` AS complaint,
           dis.icd_code AS icd10,
           dis.description AS interpretation,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id)) AS doctorName,
           cr.name AS roomName
         FROM TREATMENT t
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DISEASE dis ON dis.id = r.disease_id
         LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
         LEFT JOIN USER u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
         WHERE r.patient_id = :patientId
         ORDER BY t.time DESC`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
      selectPrescriptionRowsWithDurationFallback(
        sequelize,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit,
           COALESCE(pd.duration, 7) AS lineDuration
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId
         ORDER BY rx.time DESC, pd.no ASC`,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId
         ORDER BY rx.time DESC, pd.no ASC`,
        { patientId }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tst.id AS testId,
           tst.time AS testAt,
           tst.type AS testType,
           tst.result AS resultSummary,
           tst.note,
           tst.attachment_url AS fileUrl,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             a.username
           ) AS technicianName
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
         LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
         LEFT JOIN USER u ON u.id = te.user_id
         LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
         WHERE r.patient_id = :patientId
         ORDER BY tst.time DESC`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           s.id AS orderId,
           s.type AS surgeryType,
           s.start,
           s.end,
           s.result,
           s.surgeon,
           s.note,
           s.urgency
         FROM SURGERY s
         JOIN PROCEDURE_ pr ON pr.order_id = s.id
         JOIN \`ORDER\` o ON o.id = pr.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :patientId
         ORDER BY s.start DESC`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT id, time, \`condition\`, weight, height, blood_pressure, heart_rate, temperature, spo2, respiratory_rate, status
         FROM MEDICAL_RECORD
         WHERE patient_id = :patientId
         ORDER BY time DESC`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
    ]);

    const rxByTreatment = new Map();
    for (const row of rxRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!rxByTreatment.has(tid)) rxByTreatment.set(tid, new Map());
      const ordersMap = rxByTreatment.get(tid);
      if (!ordersMap.has(row.orderId)) {
        ordersMap.set(row.orderId, {
          id: row.orderId,
          prescribedAt: row.prescribedAt,
          signatureStatus: 'signed',
          medications: [],
        });
      }
      if (row.name) {
        ordersMap.get(row.orderId).medications.push({
          id: `${row.orderId}-${row.medNo}`,
          name: row.name,
          quantity: String(row.quantity ?? ''),
          frequency: row.frequency || '',
          unit: row.unit || '',
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
        });
      }
    }

    const labByTreatment = new Map();
    for (const row of labRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!labByTreatment.has(tid)) labByTreatment.set(tid, []);
      labByTreatment.get(tid).push({
        id: row.testId,
        testType: row.testType,
        testAt: row.testAt,
        resultSummary: row.resultSummary || '',
        note: row.note || '',
        fileUrl: row.fileUrl || null,
        technicianName: row.technicianName || '',
      });
    }

    const surgeryByTreatment = new Map();
    for (const row of surgeryRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!surgeryByTreatment.has(tid)) surgeryByTreatment.set(tid, []);
      surgeryByTreatment.get(tid).push({
        id: row.orderId,
        surgeryType: row.surgeryType,
        start: row.start,
        end: row.end,
        result: row.result || '',
        surgeon: row.surgeon || '',
        note: row.note || '',
        urgency: row.urgency || '',
      });
    }

    const visits = (treatments || []).map((t) => {
      const tid = t.treatmentId;
      const ordersMap = rxByTreatment.get(tid) || new Map();
      const prescriptionsList = Array.from(ordersMap.values());
      const vitalRow = pickClosestVital(t.visitAt, mrRows);
      return {
        treatmentId: tid,
        visitAt: t.visitAt,
        department: t.department || '',
        complaint: t.complaint || '',
        doctorName: t.doctorName || '',
        roomName: t.roomName || '',
        icd10: t.icd10 || '',
        interpretation: t.interpretation || '',
        vitals: mapMedicalRecordToVitals(vitalRow),
        prescriptions: prescriptionsList,
        labTests: labByTreatment.get(tid) || [],
        surgeries: surgeryByTreatment.get(tid) || [],
      };
    });

    res.json({ success: true, visits });
  } catch (error) {
    console.error('Get patient medical visits error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/appointments/medical-regimens
 * Patient portal: one card per completed encounter (REGIMEN with end set), aggregating all TREATMENT rows in that regimen.
 */
exports.getPatientMedicalRegimens = async (req, res) => {
  try {
    const userId = req.user.userId;
    const patientId = await getPatientIdByUserId(userId);
    if (!patientId) {
      return res.json({ success: true, regimens: [] });
    }

    const regimenRows = await sequelize.query(
      `SELECT r.id AS regimenId, r.start AS regimenStart, r.end AS regimenEnd,
              d.icd_code AS icd10, d.description AS diseaseDescription
       FROM REGIMEN r
       LEFT JOIN DISEASE d ON d.id = r.disease_id
       WHERE r.patient_id = :patientId AND r.end IS NOT NULL
       ORDER BY r.start DESC, r.id DESC`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    );
    if (!regimenRows.length) {
      return res.json({ success: true, regimens: [] });
    }

    const regimenIds = regimenRows.map((x) => Number(x.regimenId)).filter((id) => Number.isFinite(id));
    const idCsv = regimenIds.join(',');

    const hospitalTransferRows = await sequelize.query(
      `SELECT t.regimen_id AS regimenId,
              tr.order_id AS orderId,
              tr.reason,
              tr.time AS transferAt,
              tr.note,
              ht.to_id AS toHospitalId,
              ht.to_name AS toHospitalName,
              ht.transport,
              ht.form_payload AS formPayload
       FROM TREATMENT t
       JOIN \`ORDER\` o ON o.treatment_id = t.id
       JOIN TRANSFERENCE tr ON tr.order_id = o.id
       INNER JOIN HOSPITAL_TRANSFERENCE ht ON ht.transference_id = tr.order_id
       WHERE t.regimen_id IN (${idCsv})
       ORDER BY tr.time ASC`,
      { type: QueryTypes.SELECT }
    );

    const hospitalTransfersByRegimen = new Map();
    for (const row of hospitalTransferRows || []) {
      const rid = Number(row.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!hospitalTransfersByRegimen.has(rid)) hospitalTransfersByRegimen.set(rid, []);
      hospitalTransfersByRegimen.get(rid).push({
        orderId: Number(row.orderId),
        reason: row.reason || '',
        note: row.note || '',
        transferAt: row.transferAt,
        toHospitalId: row.toHospitalId != null ? String(row.toHospitalId) : null,
        toHospitalName: row.toHospitalName || '',
        transport: row.transport || null,
        formPayload: normalizeJsonColumn(row.formPayload),
      });
    }

    const trackingSlipRows = await sequelize.query(
      `SELECT
         t.regimen_id AS regimenId,
         o.id AS orderId,
         t.time AS createdAt,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
           acc.username,
           NULL
         ) AS createdByDoctor,
         p.note AS payload
       FROM TREATMENT t
       JOIN \`ORDER\` o ON o.treatment_id = t.id
       JOIN PROCEDURE_ p ON p.order_id = o.id
       LEFT JOIN DOCTOR d ON d.doctor_id = p.doctor_id
       LEFT JOIN \`USER\` u ON u.id = d.user_id
       LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
       WHERE t.regimen_id IN (${idCsv})
         AND p.type = 'HEALTH_TRACKING_SLIP'
       ORDER BY t.time ASC, o.id ASC`,
      { type: QueryTypes.SELECT }
    );

    const trackingSlipsByRegimen = new Map();
    for (const row of trackingSlipRows || []) {
      const rid = Number(row.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!trackingSlipsByRegimen.has(rid)) trackingSlipsByRegimen.set(rid, []);
      const payload = normalizeJsonColumn(row.payload);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      trackingSlipsByRegimen.get(rid).push({
        orderId: Number(row.orderId),
        createdAt: row.createdAt,
        createdByDoctor: row.createdByDoctor || null,
        rows: rows.map((r) => ({
          id: Number(r?.id) || 0,
          updatedAt: r?.updatedAt || r?.time || row.createdAt,
          bloodPressure: r?.bloodPressure || '',
          pulse: Number(r?.pulse) || 0,
          temperature: Number(r?.temperature) || 0,
          weight: Number(r?.weight) || 0,
          respiratoryRate: Number(r?.respiratoryRate) || 0,
          spo2: Number(r?.spo2) || 0,
          symptoms: r?.symptoms || '',
        })),
        formPayload: payload,
      });
    }

    const followUpReexamRows = await sequelize.query(
      `SELECT
         t.regimen_id AS regimenId,
         o.id AS orderId,
         t.time AS createdAt,
         p.note AS payload
       FROM TREATMENT t
       JOIN \`ORDER\` o ON o.treatment_id = t.id
       JOIN PROCEDURE_ p ON p.order_id = o.id
       WHERE t.regimen_id IN (${idCsv})
         AND p.type = 'FOLLOW_UP_REEXAM_SLIP'
       ORDER BY t.time ASC, o.id ASC`,
      { type: QueryTypes.SELECT }
    );

    const followUpReexamSlipsByRegimen = new Map();
    for (const row of followUpReexamRows || []) {
      const rid = Number(row.regimenId);
      if (!Number.isFinite(rid)) continue;
      const slip = normalizeJsonColumn(row.payload);
      if (!slip || typeof slip !== 'object') continue;
      if (!followUpReexamSlipsByRegimen.has(rid)) followUpReexamSlipsByRegimen.set(rid, []);
      followUpReexamSlipsByRegimen.get(rid).push({
        orderId: Number(row.orderId),
        createdAt: row.createdAt,
        slip,
      });
    }

    const [treatments, rxRows, labRows, surgeryRows, mrRows] = await Promise.all([
      sequelize.query(
        `SELECT
           t.id AS treatmentId,
           t.regimen_id AS regimenId,
           t.time AS visitAt,
           t.type AS department,
           t.\`condition\` AS complaint,
           dis.icd_code AS icd10,
           dis.description AS interpretation,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), acc.username, CONCAT('doctor#', d.user_id)) AS doctorName,
           cr.name AS roomName
         FROM TREATMENT t
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN DISEASE dis ON dis.id = r.disease_id
         LEFT JOIN DOCTOR d ON d.doctor_id = t.doctor_id
         LEFT JOIN USER u ON u.id = d.user_id
         LEFT JOIN ACCOUNT acc ON acc.user_id = d.user_id
         LEFT JOIN CLINIC_ROOM cr ON cr.id = t.room_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY t.time ASC`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
      selectPrescriptionRowsWithDurationFallback(
        sequelize,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit,
           COALESCE(pd.duration, 7) AS lineDuration
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY rx.time DESC, pd.no ASC`,
        `SELECT
           o.treatment_id AS treatmentId,
           rx.order_id AS orderId,
           rx.time AS prescribedAt,
           pd.no AS medNo,
           m.name,
           pd.quantity,
           pd.\`usage\` AS frequency,
           pd.unit
         FROM MEDICAL_PRESCRIPTION rx
         JOIN \`ORDER\` o ON o.id = rx.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PRESCRIPTION_DETAIL pd ON pd.prescription_id = rx.order_id
         LEFT JOIN MEDICINE m ON m.id = pd.medicine_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY rx.time DESC, pd.no ASC`,
        { patientId }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           tst.id AS testId,
           tst.time AS testAt,
           tst.type AS testType,
           tst.result AS resultSummary,
           tst.note,
           tst.attachment_url AS fileUrl,
           COALESCE(
             NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
             a.username
           ) AS technicianName
         FROM TEST tst
         JOIN \`ORDER\` o ON o.id = tst.id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         LEFT JOIN PROCEDURE_ p ON p.order_id = tst.id
         LEFT JOIN TECHNICIAN te ON te.technician_id = COALESCE(tst.technician_id, p.technician_id)
         LEFT JOIN USER u ON u.id = te.user_id
         LEFT JOIN ACCOUNT a ON a.user_id = te.user_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY tst.time DESC`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           o.treatment_id AS treatmentId,
           s.id AS orderId,
           s.type AS surgeryType,
           s.start,
           s.end,
           s.result,
           s.surgeon,
           s.note,
           s.urgency
         FROM SURGERY s
         JOIN PROCEDURE_ pr ON pr.order_id = s.id
         JOIN \`ORDER\` o ON o.id = pr.order_id
         JOIN TREATMENT t ON t.id = o.treatment_id
         JOIN REGIMEN r ON r.id = t.regimen_id
         WHERE r.patient_id = :patientId AND r.id IN (${idCsv})
         ORDER BY s.start DESC`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT id, time, \`condition\`, weight, height, blood_pressure, heart_rate, temperature, spo2, respiratory_rate, status
         FROM MEDICAL_RECORD
         WHERE patient_id = :patientId
         ORDER BY time DESC`,
        { replacements: { patientId }, type: QueryTypes.SELECT }
      ),
    ]);

    const rxByTreatment = new Map();
    for (const row of rxRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!rxByTreatment.has(tid)) rxByTreatment.set(tid, new Map());
      const ordersMap = rxByTreatment.get(tid);
      if (!ordersMap.has(row.orderId)) {
        ordersMap.set(row.orderId, {
          id: row.orderId,
          prescribedAt: row.prescribedAt,
          signatureStatus: 'signed',
          medications: [],
        });
      }
      if (row.name) {
        ordersMap.get(row.orderId).medications.push({
          id: `${row.orderId}-${row.medNo}`,
          name: row.name,
          quantity: String(row.quantity ?? ''),
          frequency: row.frequency || '',
          unit: row.unit || '',
          duration: String(row.lineDuration != null ? row.lineDuration : 7),
        });
      }
    }

    const labByTreatment = new Map();
    for (const row of labRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!labByTreatment.has(tid)) labByTreatment.set(tid, []);
      labByTreatment.get(tid).push({
        id: row.testId,
        testType: row.testType,
        testAt: row.testAt,
        resultSummary: row.resultSummary || '',
        note: row.note || '',
        fileUrl: row.fileUrl || null,
        technicianName: row.technicianName || '',
      });
    }

    const surgeryByTreatment = new Map();
    for (const row of surgeryRows) {
      const tid = row.treatmentId;
      if (tid == null) continue;
      if (!surgeryByTreatment.has(tid)) surgeryByTreatment.set(tid, []);
      surgeryByTreatment.get(tid).push({
        id: row.orderId,
        surgeryType: row.surgeryType,
        start: row.start,
        end: row.end,
        result: row.result || '',
        surgeon: row.surgeon || '',
        note: row.note || '',
        urgency: row.urgency || '',
      });
    }

    const treatmentsByRegimen = new Map();
    for (const t of treatments || []) {
      const rid = Number(t.regimenId);
      if (!Number.isFinite(rid)) continue;
      if (!treatmentsByRegimen.has(rid)) treatmentsByRegimen.set(rid, []);
      treatmentsByRegimen.get(rid).push(t);
    }

    const regimens = (regimenRows || []).map((reg) => {
      const rid = Number(reg.regimenId);
      const tlist = treatmentsByRegimen.get(rid) || [];
      const primary = tlist[0] || null;

      const prescriptionsDedup = new Map();
      for (const tr of tlist) {
        const tid = tr.treatmentId;
        const ordersMap = rxByTreatment.get(tid) || new Map();
        for (const order of ordersMap.values()) {
          if (!prescriptionsDedup.has(order.id)) prescriptionsDedup.set(order.id, order);
        }
      }
      const prescriptionsList = Array.from(prescriptionsDedup.values());

      const labDedup = new Map();
      for (const tr of tlist) {
        for (const lab of labByTreatment.get(tr.treatmentId) || []) {
          labDedup.set(lab.id, lab);
        }
      }
      const labTests = Array.from(labDedup.values());

      const surgeryDedup = new Map();
      for (const tr of tlist) {
        for (const s of surgeryByTreatment.get(tr.treatmentId) || []) {
          surgeryDedup.set(s.id, s);
        }
      }
      const surgeries = Array.from(surgeryDedup.values());

      const complaints = tlist.map((x) => x.complaint).filter((c) => c && String(c).trim());
      const doctors = [...new Set(tlist.map((x) => x.doctorName).filter(Boolean))];

      const vitalRow = pickVitalInRegimenWindow(mrRows, reg.regimenStart, reg.regimenEnd);

      return {
        regimenId: rid,
        treatmentId: primary ? primary.treatmentId : 0,
        visitAt: reg.regimenStart,
        visitEnd: reg.regimenEnd,
        department: primary?.department || tlist.find((x) => x.department)?.department || '',
        complaint: complaints.length ? complaints.join('\n\n') : '',
        doctorName: doctors.length ? doctors.join(', ') : primary?.doctorName || '',
        roomName: primary?.roomName || '',
        icd10: primary?.icd10 || reg.icd10 || '',
        interpretation: primary?.interpretation || reg.diseaseDescription || '',
        vitals: mapMedicalRecordToVitals(vitalRow),
        prescriptions: prescriptionsList,
        labTests,
        surgeries,
        hospitalTransfers: hospitalTransfersByRegimen.get(rid) || [],
        healthTrackingSlips: trackingSlipsByRegimen.get(rid) || [],
        followUpReexamSlips: followUpReexamSlipsByRegimen.get(rid) || [],
      };
    });

    res.json({ success: true, regimens });
  } catch (error) {
    console.error('Get patient medical regimens error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/appointments/symptom-logs
 * Patient portal: saved symptom-checker analyses (SYMPTOM_LOG).
 */
exports.getPatientSymptomLogs = async (req, res) => {
  try {
    const userId = req.user.userId;
    const patientId = await getPatientIdByUserId(userId);
    if (!patientId) {
      return res.json({ success: true, logs: [] });
    }
    const rows = await sequelize.query(
      `SELECT id, time, disease, suggestion FROM SYMPTOM_LOG WHERE patient_id = :patientId ORDER BY time DESC LIMIT 200`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    );
    res.json({
      success: true,
      logs: rows.map((r) => ({
        id: r.id,
        time: r.time,
        condition: r.disease || '',
        suggestion: r.suggestion || '',
      })),
    });
  } catch (error) {
    console.error('Get patient symptom logs error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

/**
 * GET /api/appointments/lab-tests/:testId/details
 * Patient portal: TEST_DETAIL rows for a test that belongs to the logged-in patient.
 */
exports.getPatientLabTestDetails = async (req, res) => {
  try {
    const userId = req.user.userId;
    const patientId = await getPatientIdByUserId(userId);
    if (!patientId) {
      return res.status(404).json({ success: false, message: 'Patient profile not found' });
    }

    const testId = Number(req.params.testId);
    if (!Number.isFinite(testId) || testId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid test id' });
    }

    const exists = await sequelize.query(
      `SELECT tst.id
       FROM TEST tst
       JOIN \`ORDER\` o ON o.id = tst.id
       JOIN TREATMENT t ON t.id = o.treatment_id
       JOIN REGIMEN r ON r.id = t.regimen_id
       WHERE tst.id = :id AND r.patient_id = :patientId
       LIMIT 1`,
      { replacements: { id: testId, patientId }, type: QueryTypes.SELECT }
    );
    if (!exists[0]) {
      return res.status(404).json({ success: false, message: 'Lab test not found' });
    }

    const details = await sequelize.query(
      `SELECT
         test_id AS testId,
         no,
         \`index\` AS itemIndex,
         result,
         unit
       FROM TEST_DETAIL
       WHERE test_id = :testId
       ORDER BY no ASC`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );

    res.json({ success: true, details });
  } catch (error) {
    console.error('Get patient lab test details error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

exports.updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const apptIdNum = Number(id);
    const patientId = await getPatientIdByUserId(userId);
    if (!patientId) {
      return res.status(404).json({ message: 'Patient profile not found' });
    }

    const [apptRow] = await sequelize.query(
      `SELECT id AS apptId, status AS apptStatus
       FROM APPOINTMENT
       WHERE id = :apptId AND patient_id = :patientId
       LIMIT 1`,
      { replacements: { apptId: apptIdNum, patientId }, type: QueryTypes.SELECT }
    );
    if (!apptRow?.apptId) {
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
    if (nextStatus === 'cancelled') {
      const cancellationReason = String(req.body.cancellationReason ?? req.body.reason ?? '').trim();
      if (!cancellationReason) {
        return res.status(400).json({ message: 'Cancellation reason is required' });
      }
      const curStatus = apptRow.apptStatus;
      if (curStatus && String(curStatus).toLowerCase() !== 'cancelled') {
        await notifyDoctorPatientCancelledAppointment(sequelize, id, cancellationReason);
      }
      await sequelize.query(
        `UPDATE APPOINTMENT
         SET status = 'cancelled', cancellation_reason = :reason
         WHERE id = :id AND patient_id = :patientId`,
        { replacements: { id, patientId, reason: cancellationReason }, type: QueryTypes.UPDATE }
      );
      await invalidatePatientCaches(patientId);
      return res.status(200).json({ success: true, appointment: { id: Number(id), status: 'Cancelled' } });
    }
    if (nextStatus) {
      if (String(apptRow.apptStatus || '').toLowerCase() === String(nextStatus).toLowerCase()) {
        return res.status(200).json({ success: true, appointment: { id: Number(id), status: req.body.status || 'Upcoming' } });
      }
      await sequelize.query(
        'UPDATE APPOINTMENT SET status = :status WHERE id = :id AND patient_id = :patientId AND status <> :status',
        { replacements: { id, patientId, status: nextStatus }, type: QueryTypes.UPDATE }
      );
      await invalidatePatientCaches(patientId);
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
    const cancellationReason = String(req.body?.cancellationReason ?? req.body?.reason ?? '').trim();
    if (!cancellationReason) {
      return res.status(400).json({ message: 'Cancellation reason is required' });
    }
    const own = await sequelize.query(
      'SELECT id FROM APPOINTMENT WHERE id = :id AND patient_id = :patientId LIMIT 1',
      { replacements: { id, patientId }, type: QueryTypes.SELECT }
    );
    if (!own[0]) {
      return res.status(404).json({ message: 'Appointment not found or access denied' });
    }
    const [curDel] = await sequelize.query(
      'SELECT status FROM APPOINTMENT WHERE id = :id AND patient_id = :patientId LIMIT 1',
      { replacements: { id, patientId }, type: QueryTypes.SELECT }
    );
    if (curDel?.status && String(curDel.status).toLowerCase() !== 'cancelled') {
      await notifyDoctorPatientCancelledAppointment(sequelize, id, cancellationReason);
    }
    await sequelize.query(
      "UPDATE APPOINTMENT SET status = 'cancelled', cancellation_reason = :reason WHERE id = :id",
      { replacements: { id, reason: cancellationReason }, type: QueryTypes.UPDATE }
    );
    await invalidatePatientCaches(patientId);
    res.status(200).json({ success: true, message: 'Appointment deleted successfully' });
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

const NURSE_APPT_SELECT = `
  SELECT
    a.id,
    a.time AS slotTime,
    DATE_FORMAT(a.time, '%Y-%m-%d') AS wallDate,
    TIME_FORMAT(a.time, '%H:%i:%s') AS wallTime,
    a.\`condition\` AS conditionNote,
    a.doctor_id AS doctorId,
    a.room_id AS roomId,
    COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name,''), ' ', COALESCE(du.last_name,''))), ''), dacc.username) AS doctorName,
    COALESCE(d.specifications, '') AS department,
    COALESCE(cr.name, '') AS roomName
  FROM APPOINTMENT a
  JOIN DOCTOR d ON d.doctor_id = a.doctor_id
  JOIN USER du ON du.id = d.user_id
  JOIN ACCOUNT dacc ON dacc.user_id = d.user_id
  LEFT JOIN CLINIC_ROOM cr ON cr.id = a.room_id
`;

/**
 * GET /api/appointments/nurse/check-in-options?patientId=OP00000001|1
 * Today's scheduled bookings for patient + today's open (unassigned) slots.
 */
exports.getNurseCheckInOptions = async (req, res) => {
  try {
    if (!assertNurseOrAdmin(req, res)) return;
    const n = parseNursePatientId(req.query.patientId);
    if (!n) {
      return res.status(400).json({ success: false, message: 'patientId is required' });
    }
    const patientId = await resolveNursePatientPkFromNumeric(n);
    if (!patientId) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const bookedRows = await sequelize.query(
      `${NURSE_APPT_SELECT}
       WHERE a.patient_id = :patientId
         AND a.status = 'scheduled'
         AND DATE(a.time) = CURDATE()
       ORDER BY a.time ASC, a.id ASC`,
      { replacements: { patientId }, type: QueryTypes.SELECT }
    );

    const openRows = await sequelize.query(
      `${NURSE_APPT_SELECT}
       WHERE a.patient_id IS NULL
         AND a.status = 'scheduled'
         AND DATE(a.time) = CURDATE()
       ORDER BY a.time ASC, a.id ASC`,
      { replacements: {}, type: QueryTypes.SELECT }
    );

    const todayRow = await sequelize.query('SELECT CURDATE() AS d', { type: QueryTypes.SELECT });
    const today = todayRow[0]?.d ? String(todayRow[0].d).slice(0, 10) : new Date().toISOString().slice(0, 10);

    return res.json({
      success: true,
      today,
      patientBookings: (bookedRows || []).map(mapNurseCheckInRow),
      openSlots: (openRows || []).map(mapNurseCheckInRow),
    });
  } catch (error) {
    console.error('Nurse check-in options error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/appointments/nurse/check-in-accept
 * Patient already has today's booking — nurse confirms check-in against that slot.
 */
exports.postNurseCheckInAccept = async (req, res) => {
  try {
    if (!assertNurseOrAdmin(req, res)) return;
    const nAccept = parseNursePatientId(req.body?.patientId);
    const appointmentId = Number(req.body?.appointmentId);
    if (!nAccept || !Number.isFinite(appointmentId)) {
      return res.status(400).json({ success: false, message: 'patientId and appointmentId are required' });
    }
    const patientId = await resolveNursePatientPkFromNumeric(nAccept);
    if (!patientId) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const [row] = await sequelize.query(
      `${NURSE_APPT_SELECT}
       WHERE a.id = :appointmentId
         AND a.patient_id = :patientId
         AND a.status = 'scheduled'
         AND DATE(a.time) = CURDATE()
       LIMIT 1`,
      { replacements: { appointmentId, patientId }, type: QueryTypes.SELECT }
    );

    if (!row) {
      return res.status(404).json({
        success: false,
        message: 'No matching appointment for this patient today',
      });
    }

    const optionalRoomIdRaw = req.body?.roomId;
    const optionalRoomId =
      optionalRoomIdRaw != null && optionalRoomIdRaw !== ''
        ? Number(optionalRoomIdRaw)
        : null;
    if (Number.isFinite(optionalRoomId) && optionalRoomId > 0) {
      const [roomRow] = await sequelize.query(
        'SELECT id FROM CLINIC_ROOM WHERE id = :roomId LIMIT 1',
        { replacements: { roomId: optionalRoomId }, type: QueryTypes.SELECT }
      );
      if (!roomRow) {
        return res.status(400).json({ success: false, message: 'Invalid clinic room' });
      }
      await sequelize.query(
        `UPDATE APPOINTMENT SET room_id = :roomId
         WHERE id = :appointmentId AND patient_id = :patientId
           AND status = 'scheduled' AND DATE(\`time\`) = CURDATE()`,
        { replacements: { roomId: optionalRoomId, appointmentId, patientId }, type: QueryTypes.UPDATE }
      );
    }

    const regimenId = await insertNurseVisitRegimenOpenEnd(patientId);
    await syncPatientInDeptFromAppointmentRoom(patientId, appointmentId);
    await sequelize.query(
      `UPDATE APPOINTMENT SET regimen_id = :regimenId WHERE id = :appointmentId AND patient_id = :patientId`,
      { replacements: { regimenId, appointmentId, patientId }, type: QueryTypes.UPDATE }
    );

    return res.json({
      success: true,
      appointment: mapNurseCheckInRow(row),
      regimenId,
    });
  } catch (error) {
    console.error('Nurse check-in accept error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/appointments/nurse/check-in-assign
 * Assign an open slot today to the patient (room/time come from the slot).
 */
exports.postNurseCheckInAssign = async (req, res) => {
  try {
    if (!assertNurseOrAdmin(req, res)) return;
    const nAssign = parseNursePatientId(req.body?.patientId);
    const appointmentId = Number(req.body?.appointmentId);
    const condition = String(req.body?.condition || 'Nurse walk-in check-in').trim() || 'Nurse walk-in check-in';
    if (!nAssign || !Number.isFinite(appointmentId)) {
      return res.status(400).json({ success: false, message: 'patientId and appointmentId are required' });
    }
    const patientId = await resolveNursePatientPkFromNumeric(nAssign);
    if (!patientId) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const [slot] = await sequelize.query(
      `SELECT id, patient_id AS patientId, status
       FROM APPOINTMENT
       WHERE id = :appointmentId
         AND patient_id IS NULL
         AND status = 'scheduled'
         AND DATE(\`time\`) = CURDATE()
       LIMIT 1`,
      { replacements: { appointmentId }, type: QueryTypes.SELECT }
    );

    if (!slot) {
      return res.status(400).json({
        success: false,
        message: 'Slot is not available or not an open slot today',
      });
    }

    let regimenId;
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `UPDATE APPOINTMENT
         SET patient_id = :patientId, \`condition\` = :condition, status = 'scheduled'
         WHERE id = :appointmentId AND patient_id IS NULL`,
        { replacements: { patientId, condition, appointmentId }, type: QueryTypes.UPDATE, transaction }
      );
      const [check] = await sequelize.query(
        `SELECT patient_id AS patientId FROM APPOINTMENT WHERE id = :appointmentId LIMIT 1`,
        { replacements: { appointmentId }, type: QueryTypes.SELECT, transaction }
      );
      if (Number(check?.patientId) !== patientId) {
        throw new Error('ASSIGN_CONFLICT');
      }
      regimenId = await insertNurseVisitRegimenOpenEnd(patientId, transaction);
      await syncPatientInDeptFromAppointmentRoom(patientId, appointmentId, transaction);
      await sequelize.query(
        `UPDATE APPOINTMENT SET regimen_id = :regimenId WHERE id = :appointmentId AND patient_id = :patientId`,
        { replacements: { regimenId, appointmentId, patientId }, type: QueryTypes.UPDATE, transaction }
      );
    });

    const [updated] = await sequelize.query(
      `${NURSE_APPT_SELECT} WHERE a.id = :appointmentId LIMIT 1`,
      { replacements: { appointmentId }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      appointment: updated ? mapNurseCheckInRow(updated) : { id: appointmentId },
      regimenId,
    });
  } catch (error) {
    if (error.message === 'ASSIGN_CONFLICT') {
      return res.status(409).json({ success: false, message: 'Could not assign patient to this slot' });
    }
    console.error('Nurse check-in assign error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/appointments/nurse/check-in-reschedule
 * Move patient from today's booking to another open slot today; old slot becomes open again.
 */
exports.postNurseCheckInReschedule = async (req, res) => {
  try {
    if (!assertNurseOrAdmin(req, res)) return;
    const nRe = parseNursePatientId(req.body?.patientId);
    const fromAppointmentId = Number(req.body?.fromAppointmentId);
    const toAppointmentId = Number(req.body?.toAppointmentId);
    if (!nRe || !Number.isFinite(fromAppointmentId) || !Number.isFinite(toAppointmentId)) {
      return res.status(400).json({
        success: false,
        message: 'patientId, fromAppointmentId and toAppointmentId are required',
      });
    }
    if (fromAppointmentId === toAppointmentId) {
      return res.status(400).json({ success: false, message: 'Cannot reschedule to the same slot' });
    }
    const patientId = await resolveNursePatientPkFromNumeric(nRe);
    if (!patientId) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    let regimenId;
    await sequelize.transaction(async (transaction) => {
      const [fromRow] = await sequelize.query(
        `SELECT id, patient_id AS patientId, \`condition\` AS cond, status
         FROM APPOINTMENT
         WHERE id = :fromAppointmentId
           AND patient_id = :patientId
           AND status = 'scheduled'
           AND DATE(\`time\`) = CURDATE()
         LIMIT 1`,
        { replacements: { fromAppointmentId, patientId }, type: QueryTypes.SELECT, transaction }
      );
      if (!fromRow) {
        throw new Error('SOURCE_APPT_NOT_FOUND');
      }

      const [toRow] = await sequelize.query(
        `SELECT id, patient_id AS patientId, status
         FROM APPOINTMENT
         WHERE id = :toAppointmentId
           AND patient_id IS NULL
           AND status = 'scheduled'
           AND DATE(\`time\`) = CURDATE()
         LIMIT 1`,
        { replacements: { toAppointmentId }, type: QueryTypes.SELECT, transaction }
      );
      if (!toRow) {
        throw new Error('TARGET_SLOT_NOT_OPEN');
      }

      const carriedCondition = String(fromRow.cond || '').trim() || 'Rescheduled check-in';

      await sequelize.query(
        `UPDATE APPOINTMENT
         SET patient_id = NULL, \`condition\` = 'Open slot', regimen_id = NULL
         WHERE id = :fromAppointmentId AND patient_id = :patientId`,
        { replacements: { fromAppointmentId, patientId }, type: QueryTypes.UPDATE, transaction }
      );

      await sequelize.query(
        `UPDATE APPOINTMENT
         SET patient_id = :patientId, \`condition\` = :condition, status = 'scheduled'
         WHERE id = :toAppointmentId AND patient_id IS NULL`,
        {
          replacements: { patientId, condition: carriedCondition, toAppointmentId },
          type: QueryTypes.UPDATE,
          transaction,
        }
      );

      const [checkTo] = await sequelize.query(
        `SELECT patient_id AS patientId FROM APPOINTMENT WHERE id = :toAppointmentId LIMIT 1`,
        { replacements: { toAppointmentId }, type: QueryTypes.SELECT, transaction }
      );
      if (Number(checkTo?.patientId) !== patientId) {
        throw new Error('RESCHEDULE_ASSIGN_FAILED');
      }

      regimenId = await insertNurseVisitRegimenOpenEnd(patientId, transaction);
      await syncPatientInDeptFromAppointmentRoom(patientId, toAppointmentId, transaction);
      await sequelize.query(
        `UPDATE APPOINTMENT SET regimen_id = :regimenId WHERE id = :toAppointmentId AND patient_id = :patientId`,
        { replacements: { regimenId, toAppointmentId, patientId }, type: QueryTypes.UPDATE, transaction }
      );
    });

    const [updated] = await sequelize.query(
      `${NURSE_APPT_SELECT} WHERE a.id = :toAppointmentId LIMIT 1`,
      { replacements: { toAppointmentId }, type: QueryTypes.SELECT }
    );

    await notifyDoctorsAfterNurseReschedule(sequelize, {
      fromAppointmentId,
      toAppointmentId,
      patientId,
    });

    return res.json({
      success: true,
      appointment: updated ? mapNurseCheckInRow(updated) : { id: toAppointmentId },
      regimenId,
    });
  } catch (error) {
    if (error.message === 'SOURCE_APPT_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Current appointment not found for this patient today' });
    }
    if (error.message === 'TARGET_SLOT_NOT_OPEN') {
      return res.status(400).json({ success: false, message: 'Target slot is not an open slot today' });
    }
    if (error.message === 'RESCHEDULE_ASSIGN_FAILED') {
      return res.status(409).json({ success: false, message: 'Reschedule could not be completed' });
    }
    console.error('Nurse check-in reschedule error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

/**
 * POST /api/appointments/nurse/regimen/checkout
 * Close the open visit (set REGIMEN.end = NOW()) and schedule medication reminders if applicable.
 * The nurse EMR UI no longer exposes checkout — visits are ended by the doctor via
 * POST /api/doctor/patients/:patientId/regimen/close (same REGIMEN.end + reminder logic).
 * This route remains for admin/tools or legacy clients.
 */
exports.postNurseRegimenCheckout = async (req, res) => {
  try {
    if (!assertNurseOrAdmin(req, res)) return;
    const nCo = parseNursePatientId(req.body?.patientId);
    const regimenId = Number(req.body?.regimenId);
    if (!nCo || !Number.isFinite(regimenId)) {
      return res.status(400).json({ success: false, message: 'patientId and regimenId are required' });
    }
    const patientId = await resolveNursePatientPkFromNumeric(nCo);
    if (!patientId) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    const [active] = await sequelize.query(
      `SELECT id FROM REGIMEN
       WHERE id = :regimenId AND patient_id = :patientId AND \`end\` IS NULL
       LIMIT 1`,
      { replacements: { regimenId, patientId }, type: QueryTypes.SELECT }
    );
    if (!active) {
      return res.status(404).json({
        success: false,
        message: 'No open visit regimen found for this patient',
      });
    }

    await sequelize.query(
      `UPDATE REGIMEN SET \`end\` = NOW()
       WHERE id = :regimenId AND patient_id = :patientId AND \`end\` IS NULL`,
      { replacements: { regimenId, patientId }, type: QueryTypes.UPDATE }
    );

    return res.json({ success: true, regimenId });
  } catch (error) {
    console.error('Nurse regimen checkout error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};
