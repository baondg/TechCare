const sequelize = require('../common/database');
const coverRepository = require('../repositories/coverRepository');

async function createCoverNotification(userId, title, message, type, relatedId = null) {
  try {
    await coverRepository.insertCoverNotification({ userId, title, message, type, relatedId });
  } catch (e) {
    console.error('Failed to create notification:', e.message);
  }
}

async function createCoverRequest(userId, { appointmentIds, reason }) {
  if (!Array.isArray(appointmentIds) || appointmentIds.length === 0) {
    return { status: 400, json: { success: false, message: 'appointmentIds array is required' } };
  }

  const doctorInfo = await coverRepository.selectDoctorInfoByUserId(userId);
  if (!doctorInfo) {
    return { status: 400, json: { success: false, message: 'Doctor profile not found' } };
  }

  const reasonText = reason || 'On leave';
  const created = [];
  for (const appointmentId of appointmentIds) {
    const appt = await coverRepository.selectScheduledAppointmentOwnedByDoctor(
      appointmentId,
      doctorInfo.doctor_id
    );
    if (!appt) continue;

    const insertId = await coverRepository.insertCoverRequest({
      doctorId: doctorInfo.doctor_id,
      appointmentId,
      reason: reasonText,
    });
    created.push({ id: insertId, appointmentId });
  }

  const sameDeptDoctors = await coverRepository.selectDoctorUserIdsBySpecifications(
    doctorInfo.specifications,
    doctorInfo.doctor_id
  );

  for (const doc of sameDeptDoctors) {
    await createCoverNotification(
      doc.user_id,
      'Cover Request',
      `Dr. ${doctorInfo.doctorName} is requesting cover for ${created.length} appointment(s). Reason: ${reasonText}`,
      'cover_request',
      created[0]?.id || null
    );
  }

  return { status: 201, json: { success: true, coverRequests: created } };
}

async function getCoverRequests(userId) {
  const doctorInfo = await coverRepository.selectDoctorInfoByUserId(userId);
  if (!doctorInfo) {
    return { status: 200, json: { success: true, coverRequests: [] } };
  }

  const rows = await coverRepository.listPendingCoverRequestsForSpecialty(
    doctorInfo.specifications,
    doctorInfo.doctor_id
  );
  return { status: 200, json: { success: true, coverRequests: rows } };
}

async function getMyCoverRequests(userId) {
  const doctorInfo = await coverRepository.selectDoctorInfoByUserId(userId);
  if (!doctorInfo) {
    return { status: 200, json: { success: true, coverRequests: [] } };
  }

  const rows = await coverRepository.listCoverRequestsByOriginalDoctor(doctorInfo.doctor_id);
  return { status: 200, json: { success: true, coverRequests: rows } };
}

async function acceptCoverRequest(userId, coverId) {
  const transaction = await sequelize.transaction();
  try {
    const doctorInfo = await coverRepository.selectDoctorInfoByUserId(userId);
    if (!doctorInfo) {
      await transaction.rollback();
      return { status: 400, json: { success: false, message: 'Doctor profile not found' } };
    }

    const cr = await coverRepository.selectPendingCoverRequestForAccept(
      coverId,
      { spec: doctorInfo.specifications, myDoctorId: doctorInfo.doctor_id },
      transaction
    );
    if (!cr) {
      await transaction.rollback();
      return { status: 404, json: { success: false, message: 'Cover request not found or already handled' } };
    }

    await coverRepository.markCoverRequestAccepted(coverId, doctorInfo.doctor_id, transaction);
    await coverRepository.reassignAppointmentDoctor(cr.appointment_id, doctorInfo.doctor_id, transaction);

    await createCoverNotification(
      cr.originalDoctorUserId,
      'Cover Accepted',
      `Dr. ${doctorInfo.doctorName} has accepted to cover your appointment #${cr.appointment_id}.`,
      'cover_accepted',
      coverId
    );

    if (cr.patient_id) {
      const patientUser = await coverRepository.selectPatientUserIdByPatientPk(cr.patient_id, transaction);
      if (patientUser) {
        await createCoverNotification(
          patientUser.user_id,
          'Doctor Change',
          `Your appointment has been reassigned to Dr. ${doctorInfo.doctorName}. The time and location remain the same.`,
          'appointment_rescheduled',
          cr.appointment_id
        );
      }
    }

    await transaction.commit();
    return { status: 200, json: { success: true, message: 'Cover request accepted' } };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function rejectCoverRequest(userId, coverId) {
  const cr = await coverRepository.selectPendingCoverRequestForReject(coverId);
  if (!cr) {
    return { status: 404, json: { success: false, message: 'Cover request not found or already handled' } };
  }

  const doctorInfo = await coverRepository.selectDoctorInfoByUserId(userId);
  await createCoverNotification(
    cr.originalDoctorUserId,
    'Cover Rejected',
    `Dr. ${doctorInfo?.doctorName || 'A colleague'} has declined your cover request for appointment #${cr.appointment_id}.`,
    'cover_rejected',
    coverId
  );

  return { status: 200, json: { success: true, message: 'Cover request rejected' } };
}

module.exports = {
  createCoverRequest,
  getCoverRequests,
  getMyCoverRequests,
  acceptCoverRequest,
  rejectCoverRequest,
};
