const express = require('express');
const { body } = require('express-validator');
const {
  createComplaint,
  getComplaints,
  getComplaintById,
  updateComplaintStatus,
  addAdminResponse
} = require('../controllers/complaintController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { allowedCategories, allowedPriorities, allowedStatuses } = require('../models/Complaint');

const router = express.Router();

// Complaint Submission Validation Rules
const createComplaintValidation = [
  body('title').trim().notEmpty().withMessage('Complaint title is required.')
    .isLength({ max: 150 }).withMessage('Title cannot exceed 150 characters.'),
  body('category').notEmpty().withMessage('Category is required.')
    .isIn(allowedCategories).withMessage('Invalid category. Must be one of: ' + allowedCategories.join(', ')),
  body('location').trim().notEmpty().withMessage('Location is required.'),
  body('description').trim().notEmpty().withMessage('Description is required.'),
  body('priority').optional()
    .isIn(allowedPriorities).withMessage('Invalid priority. Must be one of: ' + allowedPriorities.join(', '))
];

// Status Update Validation Rules
const updateStatusValidation = [
  body('status').notEmpty().withMessage('Status is required.')
    .isIn(allowedStatuses).withMessage('Invalid status. Must be one of: ' + allowedStatuses.join(', ')),
  body('message').optional().isString().trim()
];

// Admin Response Validation Rules
const addResponseValidation = [
  body('message').trim().notEmpty().withMessage('Response message is required.')
];

// Endpoints
router.post('/', protect, authorize('student'), createComplaintValidation, createComplaint);
router.get('/', protect, getComplaints);
router.get('/:id', protect, getComplaintById);
router.patch('/:id/status', protect, authorize('admin'), updateStatusValidation, updateComplaintStatus);
router.post('/:id/responses', protect, authorize('admin'), addResponseValidation, addAdminResponse);

module.exports = router;
