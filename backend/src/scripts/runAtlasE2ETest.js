const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const authRoutes = require('../routes/authRoutes');
const complaintRoutes = require('../routes/complaintRoutes');
const notificationRoutes = require('../routes/notificationRoutes');
const User = require('../models/User');
const { Complaint } = require('../models/Complaint');
const Notification = require('../models/Notification');

const PORT = 5055;
const BASE_URL = 'http://127.0.0.1:' + PORT;

// Build app
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    status: 'OK',
    message: 'Campus Complaint System API is running',
    timestamp: new Date().toISOString(),
    database: dbStatus
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/notifications', notificationRoutes);

const makeRequest = async (method, path, body = null, token = null) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

const results = [];
const logPass = (name, details = '') => {
  results.push({ name, passed: true, details });
  console.log('  [PASS] ' + name + (details ? ' (' + details + ')' : ''));
};
const logFail = (name, error) => {
  results.push({ name, passed: false, error });
  console.error('  [FAIL] ' + name + ': ' + error);
};

const runE2E = async () => {
  console.log('===============================================================');
  console.log('       CAMPUS COMPLAINT SYSTEM - LIVE ATLAS E2E AUDIT          ');
  console.log('===============================================================');

  const mongoUri = process.env.MONGO_URI;
  console.log('[1/12] Connecting to MongoDB Atlas cluster...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('       Connected to database: ' + mongoose.connection.name + ' (' + mongoose.connection.host + ')');

  const server = app.listen(PORT);
  console.log('[2/12] Ephemeral test server active on port ' + PORT);

  const testSuffix = Date.now();
  const student1Email = 'test_s1_' + testSuffix + '@testmail.campus.edu';
  const student1Reg = 'REG_ATLAS_' + testSuffix;
  const student1Password = 'StudentPass@123';

  const student2Email = 'test_s2_' + testSuffix + '@testmail.campus.edu';
  const student2Reg = 'REG2_ATLAS_' + testSuffix;
  const student2Password = 'StudentPass@456';

  let student1Token = '';
  let student1Id = '';
  let student2Token = '';
  let adminToken = '';
  let complaintId = '';

  try {
    // 1. Health check
    const health = await makeRequest('GET', '/api/health');
    if (health.status === 200 && health.data.database === 'connected') {
      logPass('1. Health endpoint reports database connected', 'Database: ' + health.data.database);
    } else {
      logFail('1. Health check failed', JSON.stringify(health.data));
    }

    // 2. Student registration
    const regRes = await makeRequest('POST', '/api/auth/register', {
      name: 'Synthetic Test Student 1',
      email: student1Email,
      studentId: student1Reg,
      registerNumber: student1Reg,
      department: 'Computer Science',
      year: '3rd Year',
      phone: '9876543210',
      password: student1Password
    });

    if (regRes.status === 201 && regRes.data.success && regRes.data.token) {
      student1Token = regRes.data.token;
      student1Id = regRes.data.user.id || regRes.data.user._id;
      logPass('2. Student registration via API', 'ID: ' + student1Id + ', Role: ' + regRes.data.user.role);
    } else {
      logFail('2. Student registration failed', JSON.stringify(regRes.data));
    }

    // 3. Verify student exists in MongoDB Atlas directly
    const userInDb = await User.findById(student1Id);
    if (userInDb && userInDb.email === student1Email.toLowerCase() && userInDb.role === 'student') {
      logPass('3. Verified student document persisted in MongoDB Atlas', 'Email: ' + userInDb.email + ', Hash present: ' + Boolean(userInDb.password));
    } else {
      logFail('3. Student persistence verification failed', 'User not found in Atlas DB');
    }

    // 4. Test student login (with email AND registerNumber)
    const loginEmail = await makeRequest('POST', '/api/auth/login', {
      email: student1Email,
      password: student1Password
    });
    const loginReg = await makeRequest('POST', '/api/auth/login', {
      registerNumber: student1Reg,
      password: student1Password
    });

    if (loginEmail.status === 200 && loginReg.status === 200 && loginEmail.data.token) {
      logPass('4. Student login with Email and Register Number', 'Email status: ' + loginEmail.status + ', RegNumber status: ' + loginReg.status);
    } else {
      logFail('4. Student login failed', 'Email: ' + loginEmail.status + ', Reg: ' + loginReg.status);
    }

    // 5. Submit a complaint
    const compRes = await makeRequest('POST', '/api/complaints', {
      title: 'E2E Atlas Test: Lab Monitor Screen Flickering',
      category: 'Infrastructure',
      location: 'Programming Lab 2 - System 18',
      priority: 'High',
      description: 'System 18 monitor exhibits flickering horizontal lines during compilation.'
    }, student1Token);

    if (compRes.status === 201 && compRes.data.success && compRes.data.complaint) {
      complaintId = compRes.data.complaint._id;
      logPass('5. Complaint submission & MongoDB Atlas persistence', 'ID: ' + complaintId + ', Initial Status: ' + compRes.data.complaint.status);
    } else {
      logFail('5. Complaint submission failed', JSON.stringify(compRes.data));
    }

    // Direct Atlas check for Complaint
    const compInDb = await Complaint.findById(complaintId);
    if (compInDb && compInDb.status === 'Pending' && compInDb.student.toString() === student1Id.toString()) {
      logPass('5b. Verified complaint persisted directly in Atlas collection', 'Title: ' + compInDb.title);
    } else {
      logFail('5b. Direct Atlas complaint verification failed');
    }

    // 6. Student view own complaints and details
    const listRes = await makeRequest('GET', '/api/complaints', null, student1Token);
    const detailsRes = await makeRequest('GET', '/api/complaints/' + complaintId, null, student1Token);

    if (listRes.status === 200 && listRes.data.count >= 1 && detailsRes.status === 200 && detailsRes.data.complaint.title === compInDb.title) {
      logPass('6. Student retrieved own complaints and complaint details', 'Found: ' + listRes.data.count + ' complaint(s)');
    } else {
      logFail('6. Student complaint retrieval failed', 'List: ' + listRes.status + ', Details: ' + detailsRes.status);
    }

    // 7. Student privacy & isolation
    const reg2Res = await makeRequest('POST', '/api/auth/register', {
      name: 'Synthetic Test Student 2',
      email: student2Email,
      studentId: student2Reg,
      registerNumber: student2Reg,
      department: 'Electrical Engineering',
      year: '2nd Year',
      phone: '9876543211',
      password: student2Password
    });
    student2Token = reg2Res.data.token;

    const list2Res = await makeRequest('GET', '/api/complaints', null, student2Token);
    const spyRes = await makeRequest('GET', '/api/complaints/' + complaintId, null, student2Token);

    if (list2Res.status === 200 && list2Res.data.count === 0 && spyRes.status === 403) {
      logPass('7. Privacy Isolation: Student 2 sees 0 complaints & blocked with 403 from Student 1', 'Status: ' + spyRes.status);
    } else {
      logFail('7. Privacy isolation failed', 'Student 2 count: ' + list2Res.data.count + ', Cross-view status: ' + spyRes.status);
    }

    // 8. Admin login and complaint listing
    const adminLoginRes = await makeRequest('POST', '/api/auth/login', {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD
    });

    if (adminLoginRes.status === 200 && adminLoginRes.data.user.role === 'admin') {
      adminToken = adminLoginRes.data.token;
      logPass('8. Admin login verified with cloud Atlas seeded admin', 'Email: ' + adminLoginRes.data.user.email);
    } else {
      logFail('8. Admin login failed', JSON.stringify(adminLoginRes.data));
    }

    const adminListRes = await makeRequest('GET', '/api/complaints', null, adminToken);
    if (adminListRes.status === 200 && adminListRes.data.complaints.some(c => c._id.toString() === complaintId)) {
      logPass('8b. Admin retrieved all complaints across campus', 'Total campus complaints: ' + adminListRes.data.count);
    } else {
      logFail('8b. Admin complaint list failed');
    }

    // 9. Admin status updates and timeline audit
    const inProgressRes = await makeRequest('PATCH', '/api/complaints/' + complaintId + '/status', {
      status: 'In Progress',
      message: 'Hardware team dispatched to Lab 2.'
    }, adminToken);

    const resolvedRes = await makeRequest('PATCH', '/api/complaints/' + complaintId + '/status', {
      status: 'Resolved',
      message: 'Monitor video cable and GPU driver reinstalled. Issue fixed.'
    }, adminToken);

    if (inProgressRes.status === 200 && resolvedRes.status === 200 && resolvedRes.data.complaint.status === 'Resolved') {
      const timelineCount = resolvedRes.data.complaint.statusTimeline.length;
      logPass('9. Admin status transitions (In Progress -> Resolved) with audit timeline', 'Timeline entries: ' + timelineCount);
    } else {
      logFail('9. Admin status update failed', JSON.stringify(resolvedRes.data));
    }

    // 10. Admin official response
    const responseRes = await makeRequest('POST', '/api/complaints/' + complaintId + '/responses', {
      message: 'Official response: Hardware testing completed. Verified working by Lab Incharge.'
    }, adminToken);

    if (responseRes.status === 201 && responseRes.data.complaint.adminResponses.length >= 1) {
      logPass('10. Admin added official response', 'Responses recorded: ' + responseRes.data.complaint.adminResponses.length);
    } else {
      logFail('10. Admin official response failed', JSON.stringify(responseRes.data));
    }

    // 11. Notifications verification
    const notifRes = await makeRequest('GET', '/api/notifications', null, student1Token);
    const notifications = notifRes.data.notifications || [];

    if (notifRes.status === 200 && notifications.length >= 3) {
      logPass('11. Notifications generated for all events', 'Total received: ' + notifications.length + ', Unread: ' + notifRes.data.unreadCount);

      // Mark single notification read
      const firstNotifId = notifications[0]._id;
      const readOneRes = await makeRequest('PATCH', '/api/notifications/' + firstNotifId + '/read', null, student1Token);

      // Mark all read
      const readAllRes = await makeRequest('PATCH', '/api/notifications/read-all', null, student1Token);
      const afterReadAll = await makeRequest('GET', '/api/notifications', null, student1Token);

      if (readOneRes.status === 200 && readAllRes.status === 200 && afterReadAll.data.unreadCount === 0) {
        logPass('11b. Single read & Read-all actions verified', 'Final unread count: ' + afterReadAll.data.unreadCount);
      } else {
        logFail('11b. Read action verification failed');
      }
    } else {
      logFail('11. Notification generation failed', 'Count: ' + notifications.length);
    }

    // 12. Security & Role-based authorization restrictions
    const studentStatusHack = await makeRequest('PATCH', '/api/complaints/' + complaintId + '/status', {
      status: 'Resolved'
    }, student1Token);

    const studentResponseHack = await makeRequest('POST', '/api/complaints/' + complaintId + '/responses', {
      message: 'Student pretending to be admin.'
    }, student1Token);

    const adminSubmitHack = await makeRequest('POST', '/api/complaints', {
      title: 'Admin complaint',
      category: 'Academic Issues',
      location: 'Office',
      description: 'Admin trying to file complaint.'
    }, adminToken);

    if (studentStatusHack.status === 403 && studentResponseHack.status === 403 && adminSubmitHack.status === 403) {
      logPass('12. Role-based authorization strictly enforced', 'All unauthorized attempts blocked with HTTP 403 Forbidden');
    } else {
      logFail('12. Role authorization check failed', 'Status: ' + studentStatusHack.status + ', Resp: ' + studentResponseHack.status + ', AdminSub: ' + adminSubmitHack.status);
    }

  } finally {
    // Teardown test server
    server.close();
    await mongoose.connection.close();
  }

  console.log('===============================================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log('  E2E TEST SUMMARY: ' + passedCount + ' PASSED / ' + failedCount + ' FAILED');
  console.log('===============================================================');

  return { passedCount, failedCount, results, testSuffix, student1Email, student2Email };
};

runE2E()
  .then(res => {
    if (res.failedCount > 0) process.exit(1);
    else process.exit(0);
  })
  .catch(err => {
    console.error('Fatal E2E Error:', err);
    process.exit(1);
  });
