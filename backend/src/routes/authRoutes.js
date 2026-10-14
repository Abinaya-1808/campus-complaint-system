const express = require('express');
const { body } = require('express-validator');
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Register Validation Rules
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email address.'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.')
];

// Login Validation Rules
const loginValidation = [
  body('password').notEmpty().withMessage('Password is required.')
];

// Public endpoints
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);

// Protected endpoints
router.get('/me', protect, getMe);

module.exports = router;
