const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const User = require('../models/User');
const { Complaint } = require('../models/Complaint');
const Notification = require('../models/Notification');

const cleanup = async () => {
  console.log('==================================================');
  console.log('        TEST DATA CLEANUP UTILITY                 ');
  console.log('==================================================');

  const mongoUri = process.env.MONGO_URI;
  await mongoose.connect(mongoUri);
  console.log('Connected to Atlas database: ' + mongoose.connection.name);

  // Identify synthetic test users (e.g., test_s... or audit_...)
  const testUsers = await User.find({
    role: 'student',
    $or: [
      { email: { $regex: '^test_s.*@testmail\\.campus\\.edu' } },
      { email: { $regex: '^test_.*@campus\\.test' } },
      { email: { $regex: '^audit_.*@campus\\.edu' } }
    ]
  });

  console.log('Found ' + testUsers.length + ' synthetic test student(s).');

  if (testUsers.length === 0) {
    console.log('No test student data to clean up. Database is already clean.');
    await mongoose.connection.close();
    process.exit(0);
  }

  const testUserIds = testUsers.map(u => u._id);

  // Delete complaints by test users
  const compDel = await Complaint.deleteMany({ student: { $in: testUserIds } });
  console.log('Deleted ' + compDel.deletedCount + ' test complaint(s).');

  // Delete notifications for test users
  const notifDel = await Notification.deleteMany({ recipient: { $in: testUserIds } });
  console.log('Deleted ' + notifDel.deletedCount + ' test notification(s).');

  // Delete test student users
  const userDel = await User.deleteMany({ _id: { $in: testUserIds } });
  console.log('Deleted ' + userDel.deletedCount + ' test student user(s).');

  console.log('==================================================');
  console.log('[?] Cleanup complete! Seeded admin account preserved.');
  console.log('==================================================');

  await mongoose.connection.close();
  process.exit(0);
};

cleanup().catch(err => {
  console.error('Cleanup error:', err.message);
  process.exit(1);
});
