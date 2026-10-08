const appointmentNotificationRepository = require('../repositories/appointmentNotificationRepository');
const logger = require('../common/logger');

async function safeRun(label, fn) {
  try {
    await fn();
  } catch (e) {
    logger.warn({ err: e }, `[appointment-notify] ${label}`);
  }
}

exports.notifyDoctorPatientBooked = (appointmentId) =>
  safeRun('notifyDoctorPatientBooked', async () => {
    const s = await appointmentNotificationRepository.selectAppointmentSummaryForNotify(appointmentId);
    if (!s) return;
    const uid = await appointmentNotificationRepository.selectDoctorUserId(s.doctorId);
    const patientName = s.patientLabel || 'A patient';
    const dept = s.department ? ` — ${s.department}` : '';
    const content = `${patientName} requested an appointment with you: ${s.dateVi} at ${s.timeVi}${dept}. Please Accept or Decline in My Appointments.`;
    await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_patient_booked', content);
  });

exports.notifyDoctorPatientCancelledAppointment = (appointmentId, reason) =>
  safeRun('notifyDoctorPatientCancelledAppointment', async () => {
    const s = await appointmentNotificationRepository.selectAppointmentSummaryForNotify(appointmentId);
    if (!s || !s.patientId) return;
    const uid = await appointmentNotificationRepository.selectDoctorUserId(s.doctorId);
    const patientName = s.patientLabel || 'A patient';
    const dept = s.department ? ` — ${s.department}` : '';
    const reasonText = reason && String(reason).trim() ? ` Reason: ${String(reason).trim()}` : '';
    const content = `${patientName} cancelled their appointment: ${s.dateVi} at ${s.timeVi}${dept}.${reasonText}`;
    await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_patient_cancelled', content);
  });

/** Doctor cancelled appointment (patient notified). */
exports.notifyPatientDoctorCover = (appointmentId, reason) =>
  safeRun('notifyPatientDoctorCover', async () => {
    const s = await appointmentNotificationRepository.selectAppointmentSummaryForNotify(appointmentId);
    if (!s || !s.patientId) return;
    const uid = await appointmentNotificationRepository.selectPatientUserId(s.patientId);
    const doctorName = s.doctorLabel || 'Your doctor';
    const dept = s.department ? ` — ${s.department}` : '';
    const reasonText = reason && String(reason).trim() ? ` Reason: ${String(reason).trim()}.` : '';
    const content = `${doctorName} cancelled your appointment: ${s.dateVi} at ${s.timeVi}${dept}.${reasonText} Please book another slot if you still need a visit.`;
    await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_doctor_cover', content);
  });

/** Doctor accepted a patient-requested booking. */
exports.notifyPatientDoctorAcceptedBooking = (appointmentId) =>
  safeRun('notifyPatientDoctorAcceptedBooking', async () => {
    const s = await appointmentNotificationRepository.selectAppointmentSummaryForNotify(appointmentId);
    if (!s || !s.patientId) return;
    const uid = await appointmentNotificationRepository.selectPatientUserId(s.patientId);
    const doctorName = s.doctorLabel || 'Your doctor';
    const dept = s.department ? ` — ${s.department}` : '';
    const content = `${doctorName} has accepted your appointment request for ${s.dateVi} at ${s.timeVi}${dept}.`;
    await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_doctor_accepted', content);
  });

/** Doctor declined a pending patient booking (slot reopened). */
exports.notifyPatientDoctorDeclinedBooking = ({ patientId, doctorLabel, dateVi, timeVi, department, reason }) =>
  safeRun('notifyPatientDoctorDeclinedBooking', async () => {
    const uid = await appointmentNotificationRepository.selectPatientUserId(patientId);
    if (!uid) return;
    const doctorName = doctorLabel || 'The doctor';
    const dept = department ? ` — ${department}` : '';
    const reasonText = reason && String(reason).trim() ? String(reason).trim() : 'No reason given';
    const content = `${doctorName} cannot keep this appointment (${dateVi} at ${timeVi}${dept}). Reason: ${reasonText}. Please choose another time slot.`;
    await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_doctor_declined', content);
  });

/** After another doctor assigns cover: notify the receiving doctor (English). */
exports.notifyDoctorReceivedCoverAppointment = ({ appointmentId, previousDoctorLabel }) =>
  safeRun('notifyDoctorReceivedCoverAppointment', async () => {
    const s = await appointmentNotificationRepository.selectAppointmentSummaryForNotify(appointmentId);
    if (!s) return;
    const uid = await appointmentNotificationRepository.selectDoctorUserId(s.doctorId);
    const dept = s.department ? ` — ${s.department}` : '';
    const transfer = previousDoctorLabel
      ? ` This visit was transferred from ${previousDoctorLabel}.`
      : '';
    if (s.patientId != null) {
      const patientName = (s.patientLabel && String(s.patientLabel).trim()) || 'A patient';
      const content = `${patientName} is now scheduled with you on ${s.dateVi} at ${s.timeVi}${dept}.${transfer}`;
      await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_cover_received', content);
    } else {
      const content = `An open slot is now on your schedule on ${s.dateVi} at ${s.timeVi}${dept}.${transfer}`;
      await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_cover_received', content);
    }
  });

/** After nurse/doctor reassigns a booked slot to another doctor (same department). */
exports.notifyPatientAppointmentDoctorReassigned = ({ patientId, dateVi, timeVi, department, oldDoctorName, newDoctorName, reason }) =>
  safeRun('notifyPatientAppointmentDoctorReassigned', async () => {
    const uid = await appointmentNotificationRepository.selectPatientUserId(patientId);
    if (!uid) return;
    const dept = department ? ` (${department})` : '';
    const reasonText = reason && String(reason).trim() ? ` Note from clinic: ${String(reason).trim()}.` : '';
    const content = `Your appointment on ${dateVi} at ${timeVi}${dept} is now covered by ${newDoctorName} (previously ${oldDoctorName}).${reasonText}`;
    await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_doctor_reassigned', content);
  });

/**
 * A booked slot moved to another time and / or room, same doctor (nurse edit): tell the patient.
 * `previous*` are the slot's former date (dd/mm/yyyy) and time (HH:mm).
 */
exports.notifyPatientAppointmentMoved = ({ appointmentId, previousDateVi, previousTimeVi }) =>
  safeRun('notifyPatientAppointmentMoved', async () => {
    const s = await appointmentNotificationRepository.selectAppointmentSummaryForNotify(appointmentId);
    if (!s || s.patientId == null) return;
    const uid = await appointmentNotificationRepository.selectPatientUserId(s.patientId);
    if (!uid) return;
    const dept = s.department ? ` (${s.department})` : '';
    const sameTime = s.dateVi === previousDateVi && s.timeVi === previousTimeVi;
    const content = sameTime
      ? `Your appointment on ${s.dateVi} at ${s.timeVi}${dept} has been moved to another room.`
      : `Your appointment on ${previousDateVi} at ${previousTimeVi} has been moved to ${s.dateVi} at ${s.timeVi}${dept}.`;
    await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_rescheduled', content);
  });

/** Y tá đổi lịch trong ngày: thông báo bác sĩ khung cũ và khung mới */
exports.notifyDoctorsAfterNurseReschedule = ({ fromAppointmentId, toAppointmentId, patientId }) =>
  safeRun('notifyDoctorsAfterNurseReschedule', async () => {
    const patientName = await appointmentNotificationRepository.selectPatientDisplayName(patientId);
    const fromS = await appointmentNotificationRepository.selectAppointmentSummaryForNotify(fromAppointmentId);
    const toS = await appointmentNotificationRepository.selectAppointmentSummaryForNotify(toAppointmentId);
    if (fromS) {
      const uid = await appointmentNotificationRepository.selectDoctorUserId(fromS.doctorId);
      const dept = fromS.department ? ` — ${fromS.department}` : '';
      const content = `${patientName} was moved to another slot and is no longer booked on ${fromS.dateVi} at ${fromS.timeVi}${dept}.`;
      await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_patient_rescheduled', content);
    }
    if (toS) {
      const uid = await appointmentNotificationRepository.selectDoctorUserId(toS.doctorId);
      const dept = toS.department ? ` — ${toS.department}` : '';
      const content = `${patientName} has been assigned to your schedule: ${toS.dateVi} at ${toS.timeVi}${dept}.`;
      await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_patient_rescheduled', content);
    }
  });

/** Patient rescheduled via portal: notify old and new doctor (English). */
exports.notifyDoctorsAfterPatientReschedule = ({ fromAppointmentId, toAppointmentId, patientId }) =>
  safeRun('notifyDoctorsAfterPatientReschedule', async () => {
    const patientName = await appointmentNotificationRepository.selectPatientDisplayName(patientId);
    const fromS = await appointmentNotificationRepository.selectAppointmentSummaryForNotify(fromAppointmentId);
    const toS = await appointmentNotificationRepository.selectAppointmentSummaryForNotify(toAppointmentId);
    if (!fromS && !toS) return;
    const sameDoctor = fromS && toS && Number(fromS.doctorId) === Number(toS.doctorId);
    if (sameDoctor) {
      const uid = await appointmentNotificationRepository.selectDoctorUserId(fromS.doctorId);
      if (!uid) return;
      const dept = toS.department ? ` — ${toS.department}` : '';
      const content = `${patientName} rescheduled: new time ${toS.dateVi} at ${toS.timeVi}${dept} (was ${fromS.dateVi} at ${fromS.timeVi}).`;
      await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_patient_rescheduled', content);
      return;
    }
    if (fromS) {
      const uid = await appointmentNotificationRepository.selectDoctorUserId(fromS.doctorId);
      const dept = fromS.department ? ` — ${fromS.department}` : '';
      const content = `${patientName} rescheduled and is no longer on your schedule: ${fromS.dateVi} at ${fromS.timeVi}${dept}.`;
      await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_patient_rescheduled', content);
    }
    if (toS) {
      const uid = await appointmentNotificationRepository.selectDoctorUserId(toS.doctorId);
      const dept = toS.department ? ` — ${toS.department}` : '';
      const content = `${patientName} rescheduled to your schedule: ${toS.dateVi} at ${toS.timeVi}${dept}.`;
      await appointmentNotificationRepository.insertNotificationForUser(uid, 'appointment_patient_rescheduled', content);
    }
  });

/**
 * After clinic-room transfer: notify all doctors linked to the destination department
 * (DOCTOR_DEPARTMENT and/or primary room in that department). Message in English.
 */
exports.notifyDepartmentDoctorsInboundClinicTransfer = ({ toRoomId, patientPk, reason, note }) =>
  safeRun('notifyDepartmentDoctorsInboundClinicTransfer', async () => {
    const room = await appointmentNotificationRepository.selectRoomDepartmentForTransfer(toRoomId);
    if (!room?.departmentId) {
      logger.warn('[transfer-notify] Destination room has no department_id; skipping doctor notifications');
      return;
    }

    const rows = await appointmentNotificationRepository.selectDistinctDoctorUserIdsInDepartment(
      room.departmentId
    );

    const pat = await appointmentNotificationRepository.selectPatientNameForInboundTransfer(patientPk);
    const patientName = (pat?.name && String(pat.name).trim()) || 'Patient';
    const reasonEn = String(reason || '').trim();
    const noteEn = String(note || '').trim();
    const deptLabel = (room.departmentName && String(room.departmentName).trim()) || 'your department';
    const roomLabel = (room.roomName && String(room.roomName).trim()) || `Room #${toRoomId}`;
    const content =
      `Inbound clinic transfer: patient ${patientName} is being transferred to ${roomLabel} (${deptLabel}). ` +
      `Reason: ${reasonEn || '—'}. ` +
      `Clinical note: ${noteEn || '—'}.`;

    for (const row of rows) {
      if (row.userId) {
        await appointmentNotificationRepository.insertNotificationForUser(
          row.userId,
          'patient_clinic_transfer_inbound',
          content
        );
      }
    }
  });
