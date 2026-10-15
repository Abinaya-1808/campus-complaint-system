const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const { Complaint, getDepartmentForCategory } = require('../models/Complaint');
const Notification = require('../models/Notification');

// @desc    Submit a new complaint
// @route   POST /api/complaints
// @access  Private (Students only)
const createComplaint = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only students can submit complaints.'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
      });
    }

    const { title, category, location, description, priority, isAnonymous, image, department } = req.body;
    const assignedDept = (department && typeof department === 'string' && department.trim().length > 0)
      ? department.trim()
      : getDepartmentForCategory(category);

    const newComplaint = new Complaint({
      title: title.trim(),
      category,
      location: location.trim(),
      description: description.trim(),
      priority: priority || 'Medium',
      isAnonymous: Boolean(isAnonymous),
      department: assignedDept,
      image: (typeof image === 'string' && image.startsWith('data:image/')) ? image : '',
      status: 'Pending',
      student: req.user._id,
      statusTimeline: [
        {
          status: 'Pending',
          message: `Complaint submitted and auto-routed to ${assignedDept}.`,
          date: new Date(),
          updatedBy: req.user._id
        }
      ],
      adminResponses: []
    });

    const savedComplaint = await newComplaint.save();

    // Notify student that complaint has been lodged
    await Notification.create({
      recipient: req.user._id,
      complaint: savedComplaint._id,
      message: `Your complaint "${savedComplaint.title}" has been lodged successfully and is Pending review.`,
      type: 'complaint_lodged'
    });

    const populatedComplaint = await Complaint.findById(savedComplaint._id)
      .populate('student', 'name email studentId registerNumber department phone year');

    return res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully.',
      complaint: populatedComplaint
    });
  } catch (error) {
    console.error('Create Complaint Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error creating complaint.'
    });
  }
};

// @desc    Get all complaints (student gets own, admin gets all)
// @route   GET /api/complaints
// @access  Private (Students and Admins)
const getComplaints = async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === 'student') {
      filter.student = req.user._id;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.category) {
      filter.category = req.query.category;
    }
    if (req.query.priority) {
      filter.priority = req.query.priority;
    }

    const complaints = await Complaint.find(filter)
      .populate('student', 'name email studentId registerNumber department phone year')
      .populate('statusTimeline.updatedBy', 'name email role')
      .populate('adminResponses.admin', 'name email role')
      .sort({ createdAt: -1 });

    const enrichedComplaints = complaints.map(c => {
      const cObj = c.toObject ? c.toObject() : { ...c };
      cObj.department = cObj.department || getDepartmentForCategory(cObj.category);
      return cObj;
    });
    return res.status(200).json({
      success: true,
      count: enrichedComplaints.length,
      complaints: enrichedComplaints
    });
  } catch (error) {
    console.error('Get Complaints Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching complaints.'
    });
  }
};

// @desc    Get single complaint by ID
// @route   GET /api/complaints/:id
// @access  Private (Owner student or Admin)
const getComplaintById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid complaint ID format.'
      });
    }

    const complaint = await Complaint.findById(id)
      .populate('student', 'name email studentId registerNumber department phone year')
      .populate('statusTimeline.updatedBy', 'name email role')
      .populate('adminResponses.admin', 'name email role');

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found.'
      });
    }

    if (req.user.role !== 'admin' && complaint.student._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own complaints.'
      });
    }

    const cObj = complaint.toObject ? complaint.toObject() : { ...complaint };
    cObj.department = cObj.department || getDepartmentForCategory(cObj.category);
    return res.status(200).json({
      success: true,
      complaint: cObj
    });
  } catch (error) {
    console.error('Get Complaint By ID Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving complaint.'
    });
  }
};

// @desc    Update complaint status
// @route   PATCH /api/complaints/:id/status
// @access  Private (Admins only)
const updateComplaintStatus = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only administrators can update complaint status.'
      });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid complaint ID format.'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
      });
    }

    const { status, message, department } = req.body;
    const complaint = await Complaint.findById(id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found.'
      });
    }

    const prevStatus = complaint.status;
    let deptChanged = false;
    if (department && typeof department === 'string' && department.trim().length > 0 && department.trim() !== complaint.department) {
      complaint.department = department.trim();
      deptChanged = true;
    }
    complaint.status = status;
    let timelineMsg = (message && message.trim().length > 0)
      ? message.trim()
      : `Status updated from ${prevStatus} to ${status}.`;
    if (deptChanged) {
      timelineMsg += ` (Transferred to ${complaint.department})`;
    }

    complaint.statusTimeline.push({
      status,
      message: timelineMsg,
      date: new Date(),
      updatedBy: req.user._id
    });

    await complaint.save();

    // Create notification for student owner
    await Notification.create({
      recipient: complaint.student,
      complaint: complaint._id,
      message: `Your complaint "${complaint.title}" status was updated to "${status}".${message ? ' Note: ' + message.trim() : ''}`,
      type: 'status_update'
    });

    const updatedComplaint = await Complaint.findById(id)
      .populate('student', 'name email studentId registerNumber department phone year')
      .populate('statusTimeline.updatedBy', 'name email role')
      .populate('adminResponses.admin', 'name email role');

    return res.status(200).json({
      success: true,
      message: `Complaint status updated to ${status}.`,
      complaint: updatedComplaint
    });
  } catch (error) {
    console.error('Update Complaint Status Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error updating complaint status.'
    });
  }
};

// @desc    Add admin response to complaint
// @route   POST /api/complaints/:id/responses
// @access  Private (Admins only)
const addAdminResponse = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only administrators can add responses.'
      });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid complaint ID format.'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
      });
    }

    const { message } = req.body;
    const complaint = await Complaint.findById(id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found.'
      });
    }

    complaint.adminResponses.push({
      message: message.trim(),
      admin: req.user._id,
      date: new Date()
    });

    await complaint.save();

    // Create notification for student owner
    await Notification.create({
      recipient: complaint.student,
      complaint: complaint._id,
      message: `An administrator responded to your complaint "${complaint.title}": "${message.trim()}"`,
      type: 'admin_response'
    });

    const updatedComplaint = await Complaint.findById(id)
      .populate('student', 'name email studentId registerNumber department phone year')
      .populate('statusTimeline.updatedBy', 'name email role')
      .populate('adminResponses.admin', 'name email role');

    return res.status(201).json({
      success: true,
      message: 'Admin response added successfully.',
      complaint: updatedComplaint
    });
  } catch (error) {
    console.error('Add Admin Response Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error adding admin response.'
    });
  }
};


// @desc    Submit student resolution rating and feedback
// @route   POST /api/complaints/:id/feedback
// @access  Private (Owner student only)
const submitResolutionFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid complaint ID format.'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
      });
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found.'
      });
    }

    // Security check: Only the owning student can rate
    if (complaint.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only rate your own complaints.'
      });
    }

    // Verification check: Only resolved complaints can be rated
    if (complaint.status !== 'Resolved') {
      return res.status(400).json({
        success: false,
        message: 'Feedback can only be submitted for Resolved complaints.'
      });
    }

    // Check if already rated
    if (complaint.rating) {
      return res.status(400).json({
        success: false,
        message: 'Resolution feedback has already been submitted for this complaint.'
      });
    }

    const { rating, feedback } = req.body;
    complaint.rating = Number(rating);
    complaint.feedback = (feedback && typeof feedback === 'string') ? feedback.trim() : '';
    complaint.ratedAt = new Date();

    await complaint.save();

    const updatedComplaint = await Complaint.findById(id)
      .populate('student', 'name email studentId registerNumber department phone year')
      .populate('statusTimeline.updatedBy', 'name email role')
      .populate('adminResponses.admin', 'name email role');

    return res.status(200).json({
      success: true,
      message: 'Thank you! Your resolution rating and feedback have been recorded.',
      complaint: updatedComplaint
    });
  } catch (error) {
    console.error('Submit Resolution Feedback Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error recording resolution feedback.'
    });
  }
};

module.exports = {
  createComplaint,
  getComplaints,
  getComplaintById,
  updateComplaintStatus,
  addAdminResponse,
  submitResolutionFeedback
};
