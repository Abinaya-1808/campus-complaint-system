const express = require('express');
const {
  getUserNotifications,
  markAsRead,
  markAllAsRead
} = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Endpoints
// 1. Get current authenticated user's notifications
router.get('/', protect, getUserNotifications);

// 2. Mark all user's notifications as read (placed before /:id/read)
router.patch('/read-all', protect, markAllAsRead);

// 3. Mark single notification as read
router.patch('/:id/read', protect, markAsRead);

module.exports = router;
