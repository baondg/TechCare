const express = require('express');
const router = express.Router();
const coverController = require('../controllers/coverController');
const authenticateToken = require('../middleware/authMiddleware');
const { authorizeCapability } = require('../middleware/authorizeCapability');
const { validate } = require('../middleware/validate');
const { coverIdParams, createCoverRequestBody } = require('../validators/coverSchemas');

router.use(authenticateToken);
router.use(authorizeCapability('doctor.cover.manage'));

// Doctor creates a cover request for their appointment(s)
router.post('/request', validate({ body: createCoverRequestBody }), coverController.createCoverRequest);

// Get cover requests (for same-specialty doctors)
router.get('/requests', coverController.getCoverRequests);

// Get my outgoing cover requests
router.get('/my-requests', coverController.getMyCoverRequests);

// Accept a cover request
router.put('/:id/accept', validate({ params: coverIdParams }), coverController.acceptCoverRequest);

// Reject a cover request
router.put('/:id/reject', validate({ params: coverIdParams }), coverController.rejectCoverRequest);

module.exports = router;
