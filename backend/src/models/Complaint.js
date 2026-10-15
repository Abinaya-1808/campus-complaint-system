const mongoose = require('mongoose');

const allowedCategories = [
  'Academic',
  'Hostel',
  'Infrastructure',
  'Mess/Cafeteria',
  'Library',
  'Harassment',
  'Other'
];

const allowedPriorities = ['Critical', 'High', 'Medium', 'Low'];
const allowedStatuses = ['Pending', 'In Progress', 'Resolved', 'Rejected'];

const statusTimelineSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: allowedStatuses,
    required: true
  },
  message: {
    type: String,
    default: ''
  },
  date: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { _id: false });

const adminResponseSchema = new mongoose.Schema({
  message: {
    type: String,
    required: [true, 'Admin response message is required']
  },
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const departmentRoutingMap = {
  'Hostel': 'Hostel Administration & Welfare',
  'Mess/Cafeteria': 'Food Safety & Dining Services',
  'Canteen': 'Food Safety & Dining Services',
  'Infrastructure': 'Estate & Physical Infrastructure',
  'Maintenance': 'Estate & Physical Infrastructure',
  'Classroom': 'Estate & Physical Infrastructure',
  'Academic': 'Academic Affairs & Faculty Council',
  'Library': 'Library & Learning Resources',
  'Internet/Wi-Fi': 'IT Services & Campus Network',
  'Transport': 'Campus Fleet & Transportation',
  'Harassment': 'Student Safety & Ethics Committee',
  'Other': 'Dean of Student Affairs'
};

function getDepartmentForCategory(category) {
  if (!category) return 'Dean of Student Affairs';
  const cat = String(category).trim();
  if (departmentRoutingMap[cat]) return departmentRoutingMap[cat];
  const catLower = cat.toLowerCase();
  for (const [key, dept] of Object.entries(departmentRoutingMap)) {
    if (catLower.includes(key.toLowerCase())) return dept;
  }
  return 'Dean of Student Affairs';
}

const complaintSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Complaint title is required'],
    trim: true,
    maxlength: [150, 'Title cannot exceed 150 characters']
  },
  category: {
    type: String,
    required: [true, 'Complaint category is required'],
    enum: {
      values: allowedCategories,
      message: 'Category must be one of: ' + allowedCategories.join(', ')
    }
  },
  location: {
    type: String,
    required: [true, 'Complaint location is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Complaint description is required'],
    trim: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  feedback: {
    type: String,
    default: ''
  },
  ratedAt: {
    type: Date,
    default: null
  },
  image: {
    type: String,
    default: ''
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  department: {
    type: String,
    default: 'Dean of Student Affairs'
  },
  priority: {
    type: String,
    enum: {
      values: allowedPriorities,
      message: 'Priority must be one of: ' + allowedPriorities.join(', ')
    },
    default: 'Medium'
  },
  status: {
    type: String,
    enum: {
      values: allowedStatuses,
      message: 'Status must be one of: ' + allowedStatuses.join(', ')
    },
    default: 'Pending'
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Complaint must belong to a student']
  },
  statusTimeline: [statusTimelineSchema],
  adminResponses: [adminResponseSchema]
}, {
  timestamps: true
});

const Complaint = mongoose.model('Complaint', complaintSchema);

module.exports = {
  Complaint,
  departmentRoutingMap,
  getDepartmentForCategory,
  allowedCategories,
  allowedPriorities,
  allowedStatuses
};
