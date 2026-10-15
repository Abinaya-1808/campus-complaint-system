const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { isEmailConfigured, verifyEmailConfig, maskEmail } = require('./utils/emailService');

// Load environment variables
dotenv.config();

const app = express();

// Middlewares
const allowedOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : [])
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*') || origin.startsWith('http://127.0.0.1:') || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Connect to MongoDB
connectDB();

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const emailStatus = await verifyEmailConfig().catch(err => ({ configured: false, error: err.message }));
  res.status(200).json({
    status: 'OK',
    message: 'Campus Complaint System API is running',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    emailService: {
      configured: isEmailConfigured(),
      verified: Boolean(emailStatus.verified),
      user: maskEmail(process.env.EMAIL_USER),
      error: emailStatus.error || null
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/notifications', notificationRoutes);

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to Campus Complaint System API',
    healthCheck: '/api/health'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global Error Handler (sanitizes error responses and handles bad JSON)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON payload provided in request body.'
    });
  }
  console.error('Unhandled Server Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = { app, server };
