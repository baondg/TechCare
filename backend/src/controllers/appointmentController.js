const { QueryTypes } = require('sequelize');
const sequelize = require('../common/database');

const normalizeDoctorInput = (value) => String(value || '').replace(/^Dr\.\s*/i, '').trim();
const MEDAI_CHAT_ENDPOINT = process.env.MEDAI_CHAT_ENDPOINT || 'http://localhost:3000/api/ai/chat';
const MEDAI_SYMPTOM_ENDPOINT = process.env.MEDAI_SYMPTOM_ENDPOINT || 'http://localhost:8000/api/analyze_symptoms';

async function getPatientIdByUserId(userId) {
  const rows = await sequelize.query(
    'SELECT patient_id FROM PATIENT WHERE user_id = :userId LIMIT 1',
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return rows[0]?.patient_id || null;
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

exports.getFeedbacks = async (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = await sequelize.query(
      `SELECT
         f.id,
         f.content,
         f.type,
         f.time,
         f.status,
         f.rating
       FROM FEEDBACK f
       WHERE f.user_id = :userId
       ORDER BY f.time DESC, f.id DESC`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      feedbacks: (rows || []).map((r) => ({
        id: Number(r.id),
        content: r.content || '',
        type: r.type || 'general',
        time: r.time || null,
        status: r.status || 'visible',
        rating: Number(r.rating || 0),
      })),
    });
  } catch (error) {
    console.error('Get feedbacks error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
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
       VALUES (:userId, :content, :type, :rating, 'visible')`,
      {
        replacements: { userId, content, type, rating },
        type: QueryTypes.INSERT,
      }
    );

    const [created] = await sequelize.query(
      `SELECT id, content, type, time, status, rating
       FROM FEEDBACK
       WHERE id = :id
       LIMIT 1`,
      { replacements: { id: insertId }, type: QueryTypes.SELECT }
    );

    res.status(201).json({
      success: true,
      feedback: {
        id: Number(created.id),
        content: created.content || '',
        type: created.type || 'general',
        time: created.time || null,
        status: created.status || 'visible',
        rating: Number(created.rating || 0),
      },
    });
  } catch (error) {
    console.error('Create feedback error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
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

    const aiResp = await fetch(MEDAI_SYMPTOM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptoms }),
    });
    const aiData = await aiResp.json().catch(() => ({}));
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
         WHERE r.patient_id = :patientId
           AND rx.status = 'Signed'`,
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
           AND rx.status = 'Signed'
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
