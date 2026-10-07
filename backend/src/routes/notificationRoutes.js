const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const notificationController = require('../controllers/notificationController');
const { validate } = require('../middleware/validate');
const { notificationIdParams } = require('../validators/notificationSchemas');

router.use(authenticateToken);

router.get('/unread-count', notificationController.getUnreadCount);
router.get('/', notificationController.listNotifications);
router.patch('/read-all', notificationController.markAllNotificationsRead);
router.patch('/:id/read', validate({ params: notificationIdParams }), notificationController.markNotificationRead);

module.exports = router;
