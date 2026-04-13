const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const notificationController = require('../controllers/notificationController');

router.use(authenticateToken);

router.get('/', notificationController.listNotifications);
router.patch('/read-all', notificationController.markAllNotificationsRead);
router.patch('/:id/read', notificationController.markNotificationRead);

module.exports = router;
