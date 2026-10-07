const { NotFoundError } = require('../errors/AppError');
const appointmentRepository = require('../repositories/appointmentRepository');
const patientPortalRepository = require('../repositories/patientPortalRepository');

const VISIT_VITALS_WINDOW_MS = 72 * 60 * 60 * 1000;

function calculateDisplayAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  if (Number.isNaN(birth.getTime())) return null;

  const diffMs = today - birth;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths =
    (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  const diffYears = today.getFullYear() - birth.getFullYear();

  if (diffDays < 30) return `${Math.max(0, diffDays)} days`;
  if (diffMonths < 24) return `${Math.max(0, diffMonths)} months`;
  return `${Math.max(0, diffYears)}`;
}

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
 * Nurse / technician patient list: every patient with age, latest standalone diagnosis, department
 * and today's first scheduled appointment (three queries, whatever the number of patients).
 */
async function getPortalPatients() {
  const rows = (await patientPortalRepository.listPortalPatientBaseRows()) || [];

  // Rows come from PATIENT; a row whose USER is missing has no usable id and gets no details.
  const pkOf = (p) => {
    const uid = Number(p.id);
    return Number.isFinite(uid) && uid > 0 && p.patientPk != null ? Number(p.patientPk) : null;
  };
  const patientPks = [...new Set(rows.map(pkOf).filter((pk) => pk != null))];

  const firstApptByPatientPk = new Map();
  const diagnosisByPatientPk = new Map();
  if (patientPks.length > 0) {
    const [apptRows, diagnosisRows] = await Promise.all([
      patientPortalRepository.listTodayScheduledAppointmentsForPatients(patientPks),
      patientPortalRepository.listLatestStandaloneDiagnosisRowsForPatients(patientPks),
    ]);
    for (const ar of apptRows || []) {
      const pkKey = Number(ar.mapPatientPk ?? ar.patientId);
      if (Number.isFinite(pkKey) && !firstApptByPatientPk.has(pkKey)) firstApptByPatientPk.set(pkKey, ar);
    }
    for (const d of diagnosisRows || []) diagnosisByPatientPk.set(Number(d.patientPk), d);
  }

  const patients = rows.map((p) => {
    const patientPk = pkOf(p);
    const latestDiagnosis = patientPk != null ? diagnosisByPatientPk.get(patientPk) || null : null;

    const age = calculateDisplayAge(p.dob);

    const ap = patientPk != null ? firstApptByPatientPk.get(Number(patientPk)) : null;
    const checkedIn = ap != null && Number(ap.checkedIn) === 1;
    const appointmentDoctorName =
      ap?.appointmentDoctorName != null ? String(ap.appointmentDoctorName).trim() : '';
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
      userId: Number(p.id),
      patientPk: patientPk != null ? Number(patientPk) : null,
      username: p.username || '',
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      gender: p.gender || null,
      age,
      latestDiagnosis: latestDiagnosis
        ? {
            icd10: latestDiagnosis.icd10 || '',
            interpretation: latestDiagnosis.interpretation || '',
          }
        : null,
      latestVisit: latestDiagnosis?.visitTime || null,
      doctor: appointmentDoctorName || latestDiagnosis?.doctorName || null,
      inDepartment: p.inDepartment != null ? String(p.inDepartment) : null,
      todayAppointment,
    };
  });

  return { success: true, patients };
}

async function getPatientDashboardSummary(userId) {
  const patientId = await appointmentRepository.findPatientIdByUserId(userId);
  if (!patientId) {
    return {
      success: true,
      summary: {
        nextAppointment: null,
        currentDiagnosis: null,
        activePrescriptions: 0,
        labResults: 0,
      },
      activePrescriptionsList: [],
      upcomingAppointments: [],
    };
  }

  const [nextRows, diagnosisRows, rxCountRows, labCountRows, medicationRows, upcomingRows] =
    await patientPortalRepository.selectPatientDashboardBundle(patientId);

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

  return {
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
        r.status === 'completed' ? 'Done' : r.status === 'cancelled' ? 'Cancelled' : 'Upcoming',
    })),
  };
}

async function getPatientMedicalVisits(userId) {
  const patientId = await appointmentRepository.findPatientIdByUserId(userId);
  if (!patientId) {
    return { success: true, visits: [] };
  }

  const [treatments, rxRows, labRows, surgeryRows, mrRows] =
    await patientPortalRepository.selectMedicalVisitsBundle(patientId);

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

  return { success: true, visits };
}

async function getPatientMedicalRegimens(userId) {
  const patientId = await appointmentRepository.findPatientIdByUserId(userId);
  if (!patientId) {
    return { success: true, regimens: [] };
  }

  const regimenRows = await patientPortalRepository.listCompletedRegimensForPatient(patientId);
  if (!regimenRows.length) {
    return { success: true, regimens: [] };
  }

  const regimenIds = regimenRows.map((x) => Number(x.regimenId)).filter((id) => Number.isFinite(id));
  const idCsv = regimenIds.join(',');

  const hospitalTransferRows = await patientPortalRepository.listHospitalTransfersForRegimenIdCsv(idCsv);

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

  const trackingSlipRows = await patientPortalRepository.listHealthTrackingSlipsForRegimenIdCsv(idCsv);

  const trackingSlipsByRegimen = new Map();
  for (const row of trackingSlipRows || []) {
    const rid = Number(row.regimenId);
    if (!Number.isFinite(rid)) continue;
    if (!trackingSlipsByRegimen.has(rid)) trackingSlipsByRegimen.set(rid, []);
    const payload = normalizeJsonColumn(row.payload);
    const slipRows = Array.isArray(payload?.rows) ? payload.rows : [];
    trackingSlipsByRegimen.get(rid).push({
      orderId: Number(row.orderId),
      createdAt: row.createdAt,
      createdByDoctor: row.createdByDoctor || null,
      rows: slipRows.map((r) => ({
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

  const followUpReexamRows = await patientPortalRepository.listFollowUpReexamSlipsForRegimenIdCsv(idCsv);

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

  const [treatments, rxRows, labRows, surgeryRows, mrRows] =
    await patientPortalRepository.selectRegimenDetailBundle(patientId, idCsv);

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

  return { success: true, regimens };
}

async function getPatientSymptomLogs(userId) {
  const patientId = await appointmentRepository.findPatientIdByUserId(userId);
  if (!patientId) {
    return { success: true, logs: [] };
  }
  const rows = await patientPortalRepository.listSymptomLogsForPatientLimited(patientId);
  return {
    success: true,
    logs: rows.map((r) => ({
      id: r.id,
      time: r.time,
      condition: r.disease || '',
      suggestion: r.suggestion || '',
    })),
  };
}

/** TEST_DETAIL lines of one of the signed-in patient's lab tests (test id checked by the route validator). */
async function getPatientLabTestDetails(userId, testIdRaw) {
  const patientId = await appointmentRepository.findPatientIdByUserId(userId);
  if (!patientId) throw new NotFoundError('Patient profile not found');
  const testId = Number(testIdRaw);
  const exists = await patientPortalRepository.selectLabTestIdIfPatientOwns(testId, patientId);
  if (!exists[0]) throw new NotFoundError('Lab test not found');
  return patientPortalRepository.listTestDetailsForTest(testId);
}

module.exports = {
  getPortalPatients,
  getPatientDashboardSummary,
  getPatientMedicalVisits,
  getPatientMedicalRegimens,
  getPatientSymptomLogs,
  getPatientLabTestDetails,
};
