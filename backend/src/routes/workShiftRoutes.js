const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const workShiftController = require('../controllers/workShiftController');

router.use(authenticateToken);
router.get('/', workShiftController.getMyWorkShifts);

module.exports = router;
