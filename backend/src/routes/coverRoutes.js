const express = require('express');
const router = express.Router();
const coverController = require('../controllers/coverController');
const authenticateToken = require('../middleware/authMiddleware');

router.use(authenticateToken);

// Doctor creates a cover request for their appointment(s)
router.post('/request', coverController.createCoverRequest);

// Get cover requests (for same-specialty doctors)
router.get('/requests', coverController.getCoverRequests);

// Get my outgoing cover requests
router.get('/my-requests', coverController.getMyCoverRequests);

// Accept a cover request
router.put('/:id/accept', coverController.acceptCoverRequest);

// Reject a cover request
router.put('/:id/reject', coverController.rejectCoverRequest);

module.exports = router;
