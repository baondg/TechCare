const staffRepository = require('../../repositories/staffRepository');

/** "Dr. First Last" for the signed-in user (`req.user`), else "Dr. username" / "Doctor #id". */
async function resolveDoctorDisplayName({ userId, username }) {
  const name = await staffRepository.findUserName(userId);
  if (name) {
    const full = `${name.first_name || ''} ${name.last_name || ''}`.trim();
    if (full) return `Dr. ${full}`;
  }
  if (username) return `Dr. ${username}`;
  return `Doctor #${userId}`;
}

async function getDoctorIdByUserId(userId, transaction) {
  return staffRepository.findDoctorIdByUserId(userId, transaction);
}

/** Prefer logged-in user's DOCTOR row; else latest treating doctor; else doctor on patient's appointment. */
async function getDoctorIdForUserOrLatestForPatient(userId, patientId, transaction) {
  const own = await staffRepository.findDoctorIdByUserId(userId, transaction);
  if (own) return own;
  const latest = await staffRepository.findLatestTreatingDoctorId(patientId, transaction);
  if (latest) return latest;
  // Scheduled / past appointments let technicians attach lab orders before any TREATMENT row exists.
  return (
    (await staffRepository.findAppointmentDoctorId(patientId, { scheduledOnly: true }, transaction)) ??
    staffRepository.findAppointmentDoctorId(patientId, { scheduledOnly: false }, transaction)
  );
}

const MSG_NO_DOCTOR_OR_PRIOR_TREATMENT =
  'No doctor could be resolved for this lab order: the patient needs a scheduled appointment or a prior visit (treatment), or the action must be done by a user linked to a doctor profile.';

async function getTechnicianIdByUserId(userId, transaction) {
  return (await staffRepository.findTechnicianIdByUserId(userId, transaction)) || null;
}

module.exports = {
  MSG_NO_DOCTOR_OR_PRIOR_TREATMENT,
  getDoctorIdByUserId,
  getDoctorIdForUserOrLatestForPatient,
  getTechnicianIdByUserId,
  resolveDoctorDisplayName,
};
