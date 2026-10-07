const doctorAppointmentService = require('../../services/doctorAppointmentService');
const { asyncHandler } = require('../../common/asyncHandler');

/** GET /api/doctor/appointments — `?status=&startDate=&endDate=` */
exports.getAppointments = asyncHandler(async (req, res) => {
  const appointments = await doctorAppointmentService.listAppointments(req.user, req.query);
  res.json({ success: true, appointments });
});

/** POST /api/doctor/appointments — `{ patientId, department, date, time, room?, symptoms?, notes? }` */
exports.createAppointment = asyncHandler(async (req, res) => {
  const appointment = await doctorAppointmentService.createAppointment(req.user, req.body);
  res.status(201).json({ success: true, appointment });
});

/** PUT /api/doctor/appointments/:id/cover — `{ reason, coverDoctorId }`: hand the slot to a colleague. */
exports.coverAppointment = asyncHandler(async (req, res) => {
  const appointment = await doctorAppointmentService.coverAppointment(req.user, req.params.id, req.body);
  res.json({ success: true, appointment });
});

/** PUT /api/doctor/appointments/:id/cancel — `{ reason }` */
exports.cancelAppointment = asyncHandler(async (req, res) => {
  const appointment = await doctorAppointmentService.cancelAppointment(req.user, req.params.id, req.body);
  res.json({ success: true, appointment });
});

/** PUT /api/doctor/appointments/:id/decline — `{ reason }`: release a patient request before accepting it. */
exports.declineAppointment = asyncHandler(async (req, res) => {
  const appointment = await doctorAppointmentService.declineAppointment(req.user, req.params.id, req.body);
  res.json({ success: true, appointment });
});

/** PUT /api/doctor/appointments/:id/confirm — accept a patient request. */
exports.confirmAppointment = asyncHandler(async (req, res) => {
  const appointment = await doctorAppointmentService.confirmAppointment(req.user, req.params.id);
  res.json({ success: true, appointment });
});
