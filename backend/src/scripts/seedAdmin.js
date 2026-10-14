const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const User = require('../models/User');

// Load .env relative to project root or current working directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const seedAdmin = async () => {
  try {
    const adminName = process.env.ADMIN_NAME;
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.error('Error: ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.');
      console.error('Usage: Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in your .env or shell environment.');
      process.exit(1);
    }

    if (adminPassword.length < 6) {
      console.error('Error: ADMIN_PASSWORD must be at least 6 characters long.');
      process.exit(1);
    }

    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/campus_complaints';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB for admin seeding.');

    const normalizedEmail = adminEmail.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      if (existingUser.role === 'admin') {
        console.log(`Admin user with email "${normalizedEmail}" already exists. No changes made.`);
      } else {
        console.warn(`User with email "${normalizedEmail}" already exists with role "${existingUser.role}". Admin user not overwritten.`);
      }
      await mongoose.connection.close();
      process.exit(0);
    }

    const admin = await User.create({
      name: (adminName || 'Campus Administrator').trim(),
      email: normalizedEmail,
      password: adminPassword,
      role: 'admin',
      department: (process.env.ADMIN_DEPARTMENT || 'Campus Administration').trim()
    });

    console.log(`Admin account successfully created: ${admin.email} (Role: ${admin.role})`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Admin seeding failed:', error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

seedAdmin();
