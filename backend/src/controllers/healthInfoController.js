const Patient = require('../models/Patient');
const MedicalRecord = require('../models/MedicalRecord');

const toPatientBloodType = (value) => {
  if (!value) return null;
  const upper = String(value).toUpperCase();
  if (upper.startsWith('AB')) return 'AB';
  if (upper.startsWith('A')) return 'A';
  if (upper.startsWith('B')) return 'B';
  if (upper.startsWith('O')) return 'O';
  return null;
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toBloodPressure = (sys, dia) => {
  const s = toNullableNumber(sys);
  const d = toNullableNumber(dia);
  if (s === null && d === null) return null;
  return `${s ?? 0}/${d ?? 0}`;
};

const parseAllergicInfo = (value) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const parseJSON = (value) => {
  if (!value) return {};

  if (typeof value === "object") {
    return value;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (err) {
      console.error("JSON parse error:", err);
      return {};
    }
  }

  return {};
};

const buildResponseRecord = (r) => {
  const [sys, dia] = r.blood_pressure ? r.blood_pressure.split('/') : [0, 0];
  const h = parseFloat(r.height) || 0;
  const w = parseFloat(r.weight) || 0;

  return {
      id: r.id,
      height: h,
      weight: w,
      bmi: h > 0 ? +(w / ((h / 100) ** 2)).toFixed(1) : 0,
      bloodPressureSys: parseInt(sys, 10) || 0,
      bloodPressureDia: parseInt(dia, 10) || 0,
      heartRate: r.heart_rate,
      respiratoryRate: r.respiratory_rate || 0,
      temperature: r.temperature,
      spo2: r.spo2,
      currentSymptoms: r.condition || '',
      updatedAt: r.time,
      createdAt: r.time,
      updatedBy: 'Patient',
    };
  };

exports.getHealthInfo = async (req, res) => {
  try {
    const user_id = req.user.userId;

    const patient = await Patient.findOne({
        where: { user_id },
        attributes: [
            "patient_id",
            "user_id",
            "blood_type",
            "allergic_info",
            "medical_history",
        ],
        include: [
            {
            model: MedicalRecord,
            as: "medicalRecords",
            order: [["time", "DESC"]],
            },
        ],
    });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const records = patient.medicalRecords.map(buildResponseRecord);

    const allergyInfo = parseJSON(patient.allergic_info);
    const medicalHistory = parseJSON(patient.medical_history);

    const baseInfo = records.length > 0 ? records[0] : {};

    const mappedHealthInfo = {
      ...baseInfo,
      bloodType: patient.blood_type,

      drugAllergies: allergyInfo.drugAllergies || [],
      foodAllergies: allergyInfo.foodAllergies || [],
      otherAllergies: allergyInfo.otherAllergies || [],

      chronicConditions: medicalHistory.chronicConditions || [],
      pastSurgeries: medicalHistory.pastSurgeries || [],
      familyHistory: medicalHistory.familyHistory || [],
      pastIllnesses: medicalHistory.pastIllnesses || [],
      vaccinations: medicalHistory.vaccinations || [],
      substanceAbuse: medicalHistory.substanceAbuse || [],
    };

    res.json({
      success: true,
      healthInfo: mappedHealthInfo,
      history: records,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.createHealthInfo = async (req, res) => {
  try {
    const user_id = Number(req.params.userId);
    if (req.user.userId !== user_id && req.user.role !== 'ADM') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const patient = await Patient.findOne({ where: { user_id } });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const {
      height,
      weight,
      bloodPressureSys,
      bloodPressureDia,
      heartRate,
      respiratoryRate,
      temperature,
      spo2,
      currentSymptoms,
      bloodType,
      drugAllergies,
      foodAllergies,
      otherAllergies,
      chronicConditions,
      pastSurgeries,
      familyHistory,
      pastIllnesses,
      vaccinations,
      substanceAbuse,
    } = req.body;

    const record = await MedicalRecord.create({
      patient_id: patient.patient_id,
      time: new Date(),
      condition: currentSymptoms || '',
      weight: toNullableNumber(weight) ?? 0.1,
      height: toNullableNumber(height) ?? 0.1,
      spo2: toNullableNumber(spo2),
      heart_rate: toNullableNumber(heartRate),
      blood_pressure: toBloodPressure(bloodPressureSys, bloodPressureDia),
      temperature: toNullableNumber(temperature),
      respiratory_rate: toNullableNumber(respiratoryRate),
    });

    const mappedBloodType = toPatientBloodType(bloodType);
    const allergyPayload = {
      drugAllergies: Array.isArray(drugAllergies) ? drugAllergies : [],
      foodAllergies: Array.isArray(foodAllergies) ? foodAllergies : [],
      otherAllergies: Array.isArray(otherAllergies) ? otherAllergies : [],
    };

    const medicalHistoryPayload = {
      chronicConditions: Array.isArray(chronicConditions) ? chronicConditions : [],
      pastSurgeries: Array.isArray(pastSurgeries) ? pastSurgeries : [],
      familyHistory: Array.isArray(familyHistory) ? familyHistory : [],
      pastIllnesses: Array.isArray(pastIllnesses) ? pastIllnesses : [],
      vaccinations: Array.isArray(vaccinations) ? vaccinations : [],
      substanceAbuse: Array.isArray(substanceAbuse) ? substanceAbuse : [],
    };

    await patient.update({
      ...(mappedBloodType ? { blood_type: mappedBloodType } : {}),
      allergic_info: JSON.stringify(allergyPayload),
      medical_history: JSON.stringify(medicalHistoryPayload),
    });

    res.status(201).json({
      success: true,
      healthInfo: {
        ...buildResponseRecord(record),
        bloodType: mappedBloodType || patient.blood_type,
        ...allergyPayload,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.updateHealthInfo = async (req, res) => {
  try {
    const user_id = Number(req.params.userId);
    if (req.user.userId !== user_id && req.user.role !== 'ADM') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const patient = await Patient.findOne({ where: { user_id } });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const {
      id,
      height,
      weight,
      bloodPressureSys,
      bloodPressureDia,
      heartRate,
      respiratoryRate,
      temperature,
      spo2,
      currentSymptoms,
      bloodType,
      drugAllergies,
      foodAllergies,
      otherAllergies,
      chronicConditions,
      pastSurgeries,
      familyHistory,
      pastIllnesses,
      vaccinations,
      substanceAbuse,
    } = req.body;

    const record = await MedicalRecord.findOne({
      where: { id, patient_id: patient.patient_id },
    });

    if (!record) {
      return res.status(404).json({ message: 'Medical record not found' });
    }

    await record.update({
      condition: currentSymptoms || '',
      weight: toNullableNumber(weight) ?? record.weight,
      height: toNullableNumber(height) ?? record.height,
      spo2: toNullableNumber(spo2),
      heart_rate: toNullableNumber(heartRate),
      blood_pressure: toBloodPressure(bloodPressureSys, bloodPressureDia),
      temperature: toNullableNumber(temperature),
      respiratory_rate: toNullableNumber(respiratoryRate),
      time: new Date(),
    });

    const mappedBloodType = toPatientBloodType(bloodType);
    const allergyPayload = {
      drugAllergies: Array.isArray(drugAllergies) ? drugAllergies : [],
      foodAllergies: Array.isArray(foodAllergies) ? foodAllergies : [],
      otherAllergies: Array.isArray(otherAllergies) ? otherAllergies : [],
      chronicConditions: Array.isArray(chronicConditions) ? chronicConditions : [],
      pastSurgeries: Array.isArray(pastSurgeries) ? pastSurgeries : [],
      familyHistory: Array.isArray(familyHistory) ? familyHistory : [],
      pastIllnesses: Array.isArray(pastIllnesses) ? pastIllnesses : [],
      vaccinations: Array.isArray(vaccinations) ? vaccinations : [],
      substanceAbuse: Array.isArray(substanceAbuse) ? substanceAbuse : [],
    };

    await patient.update({
      ...(mappedBloodType ? { blood_type: mappedBloodType } : {}),
      allergic_info: JSON.stringify(allergyPayload),
    });

    res.json({
      success: true,
      healthInfo: {
        ...buildResponseRecord(record),
        bloodType: mappedBloodType || patient.blood_type,
        ...allergyPayload,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// DELETE multiple health records for a patient
exports.deleteHealthInfos = async (req, res) => {
  try {
    const user_id = Number(req.params.userId);
    if (req.user.userId !== user_id && req.user.role !== 'ADM') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const patient = await Patient.findOne({ where: { user_id } });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const { ids } = req.body; // danh sách id các record cần xóa
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No record IDs provided' });
    }

    // Xóa các record cùng patient_id và id trong danh sách
    const deletedCount = await MedicalRecord.destroy({
      where: {
        patient_id: patient.patient_id,
        id: ids,
      },
    });

    res.json({
      success: true,
      message: `${deletedCount} record(s) deleted successfully`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};