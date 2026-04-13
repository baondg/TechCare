const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const workShiftController = require('../controllers/workShiftController');

router.use(authenticateToken);
router.get('/staff-directory', workShiftController.getStaffDirectory);
router.get('/', workShiftController.getMyWorkShifts);

module.exports = router;
