/**
 * controllers/appointmentController.js only maps HTTP to the appointment services. For every handler:
 * the service is stubbed, the request fields it should receive are checked, its `{ status, json }`
 * (or plain result) is sent unchanged, and a thrown error ends as a 500 without leaking its text.
 */
require('./helpers/app'); // silences logs
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const controller = require(path.join(DIST, 'controllers', 'appointmentController'));
const { errorHandler } = require(path.join(DIST, 'middleware', 'errorHandler'));
const service = (name) => require(path.join(DIST, 'services', name));

const USER = { userId: 70, role: 'nurse', username: 'nur70' };
const RESULT = { ok: true, status: 207, json: { success: true, marker: 'from-service' } };
const PLAIN = { success: true, marker: 'plain-result' };
const VALUE = { marker: 'service-value' };
/** Service returns a value the controller wraps as `{ success: true, [key]: value }`. */
const wrapped = (status, key) => ({ status, body: { success: true, [key]: VALUE } });

/**
 * [handler, service module, method, request, expected service args (from the stub's arguments),
 *  kind: 'result' (service answers {status,json}) | 'plain' (body sent as 200 JSON)
 *        | { status, body } (service answers VALUE, the controller builds the response)]
 */
const CASES = [
  ['getFeedbacks', 'appointmentFeedbackService', 'listForUser', {}, [70], 'plain'],
  ['getVisibleFeedbacks', 'appointmentFeedbackService', 'listVisible', {}, [], 'plain'],
  ['createFeedback', 'appointmentFeedbackService', 'create', { body: { rating: 5 } }, [{ userId: 70, body: { rating: 5 } }], wrapped(201, 'feedback')],
  ['getPortalPatients', 'appointmentPatientPortalService', 'getPortalPatients', {}, [], 'plain'],
  ['getAiRecommendations', 'appointmentAiService', 'getAiRecommendations', {}, [70], 'plain'],
  ['updateAiRecommendationFeedback', 'appointmentAiService', 'patchAiRecommendationFeedback', { params: { id: '9' }, body: { useful: true } }, [70, '9', { useful: true }], 'result'],
  ['chatWithAiAndSave', 'appointmentAiService', 'chatWithAiAndSave', { body: { message: 'hi' } }, ['<req>', 70, { message: 'hi' }], 'result'],
  ['getAiChatModels', 'appointmentAiService', 'listAiChatModels', {}, [], 'result'],
  ['analyzeSymptomsAndSave', 'appointmentAiService', 'analyzeSymptomsAndSave', { body: { symptoms: [] } }, ['<req>', 70, { symptoms: [] }], 'result'],
  ['getDoctors', 'appointmentCatalogService', 'getDoctors', {}, [], wrapped(200, 'doctors')],
  ['getClinicRooms', 'appointmentCatalogService', 'getClinicRooms', {}, [], wrapped(200, 'rooms')],
  ['getDepartments', 'appointmentCatalogService', 'getDepartments', {}, [], wrapped(200, 'departments')],
  ['getBookedSlots', 'appointmentSlotService', 'getBookedSlots', { query: { date: '2026-10-01' } }, [{ date: '2026-10-01' }], 'result'],
  ['getOpenSlots', 'appointmentSlotService', 'getOpenSlots', { query: { startDate: 'a' } }, [{ role: 'nurse', query: { startDate: 'a' } }], 'result'],
  ['createOpenSlot', 'appointmentSlotService', 'createOpenSlot', { body: { time: 't' } }, [{ role: 'nurse', body: { time: 't' } }], 'result'],
  ['updateOpenSlot', 'appointmentSlotService', 'updateOpenSlot', { params: { id: '3' }, body: { b: 1 } }, [{ role: 'nurse', id: '3', body: { b: 1 } }], 'result'],
  ['deleteOpenSlot', 'appointmentSlotService', 'deleteOpenSlot', { params: { id: '3' } }, [{ role: 'nurse', id: '3' }], 'result'],
  ['createAppointment', 'appointmentPatientService', 'createAppointment', { body: { b: 1 } }, [{ userId: 70, body: { b: 1 } }], wrapped(201, 'appointment')],
  ['getAppointments', 'appointmentPatientService', 'getAppointmentsForUser', {}, [70], 'plain'],
  ['getPatientDashboardSummary', 'appointmentPatientPortalService', 'getPatientDashboardSummary', {}, [70], 'plain'],
  ['getPatientMedicalVisits', 'appointmentPatientPortalService', 'getPatientMedicalVisits', {}, [70], 'plain'],
  ['getPatientMedicalRegimens', 'appointmentPatientPortalService', 'getPatientMedicalRegimens', {}, [70], 'plain'],
  ['getPatientSymptomLogs', 'appointmentPatientPortalService', 'getPatientSymptomLogs', {}, [70], 'plain'],
  ['getPatientLabTestDetails', 'appointmentPatientPortalService', 'getPatientLabTestDetails', { params: { testId: '701' } }, [70, '701'], wrapped(200, 'details')],
  ['updateAppointment', 'appointmentPatientService', 'updatePatientAppointment', { params: { id: '5' }, body: { b: 1 } }, [{ userId: 70, id: '5', body: { b: 1 } }], wrapped(200, 'appointment')],
  ['deleteAppointment', 'appointmentPatientService', 'deletePatientAppointment', { params: { id: '5' }, body: { reason: 'r' } }, [{ userId: 70, id: '5', body: { reason: 'r' } }], { status: 200, body: { success: true, message: 'Appointment deleted successfully' } }],
  ['getNurseCheckInOptions', 'appointmentNurseService', 'getNurseCheckInOptions', { query: { patientId: 'OP1' } }, [{ role: 'nurse', query: { patientId: 'OP1' } }], 'result'],
  ['postNurseCheckInAccept', 'appointmentNurseService', 'postNurseCheckInAccept', { body: { b: 1 } }, [{ role: 'nurse', body: { b: 1 } }], 'result'],
  ['postNurseCheckInAssign', 'appointmentNurseService', 'postNurseCheckInAssign', { body: { b: 1 } }, [{ role: 'nurse', body: { b: 1 } }], 'result'],
  ['postNurseCheckInReschedule', 'appointmentNurseService', 'postNurseCheckInReschedule', { body: { b: 1 } }, [{ role: 'nurse', body: { b: 1 } }], 'result'],
  ['postNurseRegimenCheckout', 'appointmentNurseService', 'postNurseRegimenCheckout', { body: { b: 1 } }, [{ role: 'nurse', body: { b: 1 } }], 'result'],
];

/** Runs one handler like Express would (errors → errorHandler) and returns `{ status, body }`. */
async function run(handler, reqFields) {
  const req = { user: USER, params: {}, query: {}, body: {}, requestId: 'rid', method: 'GET', path: '/x', ...reqFields };
  let resolveDone;
  const done = new Promise((r) => {
    resolveDone = r;
  });
  const res = {
    statusCode: 200,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.headersSent = true;
      resolveDone({ status: this.statusCode, body });
      return this;
    },
    setHeader() {},
  };
  const next = (err) => errorHandler(err, req, res, () => {});
  await handler(req, res, next);
  return Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('no response')), 1000))]);
}

for (const [name, mod, method, reqFields, expectedArgs, kind] of CASES) {
  test(`${name}: passes the service result through`, async (t) => {
    const svc = service(mod);
    const answer = kind === 'plain' ? PLAIN : kind === 'result' ? RESULT : VALUE;
    const stub = t.mock.method(svc, method, async () => answer);
    const out = await run(controller[name], reqFields);
    const args = stub.mock.calls[0].arguments.map((a) => (a && a.user === USER ? '<req>' : a));
    assert.deepEqual(args, expectedArgs);
    const expected =
      kind === 'plain' ? { status: 200, body: PLAIN } : kind === 'result' ? { status: RESULT.status, body: RESULT.json } : kind;
    assert.deepEqual(out, expected);
  });

  test(`${name}: a thrown error is a generic 500`, async (t) => {
    t.mock.method(service(mod), method, async () => {
      throw new Error('secret db detail');
    });
    const out = await run(controller[name], reqFields);
    assert.equal(out.status, 500);
    assert.doesNotMatch(JSON.stringify(out.body), /secret db detail/);
  });
}

test('every exported handler is covered', () => {
  const covered = new Set([...CASES.map((c) => c[0]), 'getRecoveryPrediction', 'getStaffPatientRecoveryPrediction']);
  assert.deepEqual(Object.keys(controller).filter((k) => !covered.has(k)), []);
});

test('getRecoveryPrediction: own patient, refresh flag, 404 without a PATIENT row', async (t) => {
  const patients = service('appointmentPatientService');
  const ai = service('appointmentAiService');
  t.mock.method(patients, 'getPatientPkForUserId', async (uid) => (uid === 70 ? 7 : null));
  const predict = t.mock.method(ai, 'recoveryPredictionForPatient', async () => RESULT);

  for (const [refresh, expected] of [['1', true], ['TRUE', true], ['0', false], [undefined, false]]) {
    const out = await run(controller.getRecoveryPrediction, { query: { refresh } });
    assert.deepEqual(out, { status: RESULT.status, body: RESULT.json });
    assert.deepEqual(predict.mock.calls.at(-1).arguments.slice(1), [7, expected]);
  }
  const missing = await run(controller.getRecoveryPrediction, { user: { ...USER, userId: 80 } });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.message, 'Patient profile not found');
});

test('getStaffPatientRecoveryPrediction: OP / numeric route id, 400 / 404', async (t) => {
  const patients = service('appointmentPatientService');
  const ai = service('appointmentAiService');
  const byRoute = t.mock.method(patients, 'getPatientPkFromRouteId', async (id) => (id === 70 ? 7 : null));
  const predict = t.mock.method(ai, 'recoveryPredictionForPatient', async () => RESULT);

  const ok = await run(controller.getStaffPatientRecoveryPrediction, { params: { patientId: 'OP0070' }, query: { refresh: 'true' } });
  assert.deepEqual(ok, { status: RESULT.status, body: RESULT.json });
  assert.deepEqual(byRoute.mock.calls[0].arguments, [70]);
  assert.deepEqual(predict.mock.calls[0].arguments.slice(1), [7, true]);

  const bad = await run(controller.getStaffPatientRecoveryPrediction, { params: { patientId: 'OPxyz' } });
  assert.deepEqual([bad.status, bad.body.message], [400, 'Invalid patient id']);
  const missing = await run(controller.getStaffPatientRecoveryPrediction, { params: { patientId: '80' } });
  assert.deepEqual([missing.status, missing.body.message], [404, 'Patient not found']);
});
