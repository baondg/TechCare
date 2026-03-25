const express = require('express');
const router = express.Router();
const healthInfoController = require('../controllers/healthInfoController');
const authenticateToken = require('../middleware/authMiddleware');

router.use(authenticateToken);


router.get('/:userId', healthInfoController.getHealthInfo);
router.put('/:userId', healthInfoController.updateHealthInfo);
router.post('/:userId', healthInfoController.createHealthInfo);

module.exports = router;