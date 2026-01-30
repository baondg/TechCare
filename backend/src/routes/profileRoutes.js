const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authenticateToken = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.get('/:userId', profileController.getProfile);
router.put('/:userId', profileController.updateProfile);
router.post('/:userId', profileController.updateProfile);

module.exports = router;
