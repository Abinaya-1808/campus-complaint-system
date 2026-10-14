const { validationResult } = require('express-validator');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');

// @desc    Register a new student user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
      });
    }

    const { name, email, password, studentId, registerNumber, department, phone, year } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // Check for duplicate email
    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered.'
      });
    }

    // Check for duplicate student ID / register number if provided
    const idToCheck = (studentId || registerNumber || '').trim();
    if (idToCheck) {
      const existingId = await User.findOne({
        $or: [
          { studentId: idToCheck },
          { registerNumber: idToCheck }
        ]
      });
      if (existingId) {
        return res.status(409).json({
          success: false,
          message: 'This student ID / register number is already registered.'
        });
      }
    }

    // Force role to student (ignore any role sent by client to prevent unauthorized admin creation)
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'student',
      studentId: idToCheck,
      registerNumber: idToCheck,
      department: (department || '').trim(),
      phone: (phone || '').trim(),
      year: (year || '').trim()
    });

    const token = generateToken(user._id, user.role);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        registerNumber: user.registerNumber,
        department: user.department,
        phone: user.phone,
        year: user.year,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Registration Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration.'
    });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
      });
    }

    const { email, loginId, registerNumber, password } = req.body;
    const identifier = (email || loginId || registerNumber || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email/register number and password.'
      });
    }

    // Lookup user by email (case-insensitive) or studentId/registerNumber
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { studentId: identifier },
        { registerNumber: identifier }
      ]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    const token = generateToken(user._id, user.role);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        registerNumber: user.registerNumber,
        department: user.department,
        phone: user.phone,
        year: user.year
      }
    });
  } catch (error) {
    console.error('Login Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.'
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      user: req.user
    });
  } catch (error) {
    console.error('GetMe Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching user profile.'
    });
  }
};

module.exports = {
  register,
  login,
  getMe
};
