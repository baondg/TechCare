const express = require('express');
const router = express.Router();
const healthInfoController = require('../controllers/healthInfoController');
const authenticateToken = require('../middleware/authMiddleware');

router.use(authenticateToken);


router.get('/:userId', healthInfoController.getHealthInfo);
router.put('/:userId', healthInfoController.updateHealthInfo);
router.post('/:userId', healthInfoController.createHealthInfo);
router.post('/:userId/delete', healthInfoController.deleteHealthInfos);
router.delete('/:userId', healthInfoController.deleteHealthInfos);

module.exports = router;