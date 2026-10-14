process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/campus_complaints_test';

const http = require('http');
const mongoose = require('mongoose');
const { server } = require('../server');
const User = require('../models/User');
const { Complaint } = require('../models/Complaint');
const Notification = require('../models/Notification');
const generateToken = require('../utils/generateToken');

const request = (options, postData) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (postData !== undefined) {
      if (typeof postData === 'string') {
        req.write(postData);
      } else {
        req.write(JSON.stringify(postData));
      }
    }
    req.end();
  });
};

const run = async () => {
  console.log('==================================================');
  console.log('  CAMPUS COMPLAINT SYSTEM - AUTOMATED API TESTS   ');
  console.log('  Database: ' + process.env.MONGO_URI);
  console.log('  Port: ' + process.env.PORT);
  console.log('==================================================');

  let passed = 0;
  let failed = 0;

  const assert = (condition, name, extra = '') => {
    if (condition) {
      passed++;
      console.log(`  [+] PASS: ${name} ${extra}`);
    } else {
      failed++;
      console.error(`  [-] FAIL: ${name} ${extra}`);
    }
  };

  try {
    // Wait for server / mongo connection ready
    await new Promise(r => setTimeout(r, 1500));

    // Clean isolated test database before test suite runs
    await User.deleteMany({});
    await Complaint.deleteMany({});
    await Notification.deleteMany({});

    const HOST = '127.0.0.1';
    const PORT = 5001;

    // 1. Health Endpoint
    const health = await request({ hostname: HOST, port: PORT, path: '/api/health', method: 'GET' });
    assert(health.status === 200 && health.data.database === 'connected', 'Health check operational');

    // 2. Auth: Register validation
    const regVal = await request({
      hostname: HOST, port: PORT, path: '/api/auth/register', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { name: '' });
    assert(regVal.status === 400, 'Register rejects empty required fields (400)');

    // 3. Auth: Register student with attempted privilege escalation (role: admin)
    const regStudent1 = await request({
      hostname: HOST, port: PORT, path: '/api/auth/register', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'Student Alpha',
      email: 'alpha@campus.edu',
      password: 'password123',
      studentId: 'STU-001',
      department: 'Computer Science',
      role: 'admin' // Escalation attack
    });
    assert(regStudent1.status === 201, 'Register student succeeds (201)');
    assert(regStudent1.data.user.role === 'student', 'Public registration forces student role');
    assert(regStudent1.data.user.password === undefined, 'Password hash excluded from register response');
    const student1Token = regStudent1.data.token;
    const student1Id = regStudent1.data.user.id;

    // 4. Auth: Duplicate registration rejection
    const dupReg = await request({
      hostname: HOST, port: PORT, path: '/api/auth/register', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'Duplicate',
      email: 'alpha@campus.edu',
      password: 'password123'
    });
    assert(dupReg.status === 409, 'Duplicate email rejected with 409 Conflict');

    // 5. Auth: Register Student 2
    const regStudent2 = await request({
      hostname: HOST, port: PORT, path: '/api/auth/register', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'Student Beta',
      email: 'beta@campus.edu',
      password: 'password123',
      studentId: 'STU-002',
      department: 'Electronics'
    });
    const student2Token = regStudent2.data.token;
    const student2Id = regStudent2.data.user.id;

    // 6. Auth: Login with invalid password
    const badLogin = await request({
      hostname: HOST, port: PORT, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'alpha@campus.edu', password: 'wrongpassword' });
    assert(badLogin.status === 401, 'Login with invalid credentials rejected (401)');

    // 7. Auth: Login with email
    const loginEmail = await request({
      hostname: HOST, port: PORT, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'alpha@campus.edu', password: 'password123' });
    assert(loginEmail.status === 200 && !!loginEmail.data.token, 'Login with email succeeds (200)');

    // 8. Auth: Login with studentId/registerNumber
    const loginId = await request({
      hostname: HOST, port: PORT, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { loginId: 'STU-001', password: 'password123' });
    assert(loginId.status === 200, 'Login with register number / studentId succeeds (200)');

    // 9. Auth: Seed Admin user in test DB
    const admin = await User.create({
      name: 'Chief Administrator',
      email: 'admin@campus.edu',
      password: 'admin12345',
      role: 'admin',
      department: 'Campus Administration'
    });
    const adminToken = generateToken(admin._id, admin.role);

    // 10. Auth: Protected /api/auth/me checks
    const meNoToken = await request({ hostname: HOST, port: PORT, path: '/api/auth/me', method: 'GET' });
    assert(meNoToken.status === 401, '/api/auth/me rejects missing token (401)');

    const meBadToken = await request({
      hostname: HOST, port: PORT, path: '/api/auth/me', method: 'GET',
      headers: { 'Authorization': 'Bearer fake_token_abc' }
    });
    assert(meBadToken.status === 401, '/api/auth/me rejects invalid token (401)');

    const meValid = await request({
      hostname: HOST, port: PORT, path: '/api/auth/me', method: 'GET',
      headers: { 'Authorization': 'Bearer ' + student1Token }
    });
    assert(meValid.status === 200 && meValid.data.user.email === 'alpha@campus.edu', '/api/auth/me returns authenticated user (200)');
    assert(meValid.data.user.password === undefined, 'Password hash excluded from /api/auth/me');

    // 11. Complaint: Submission auth guard
    const cmpNoAuth = await request({
      hostname: HOST, port: PORT, path: '/api/complaints', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { title: 'Broken AC' });
    assert(cmpNoAuth.status === 401, 'Complaint submission rejects unauthenticated request (401)');

    // 12. Complaint: Admin cannot submit complaint
    const cmpAdminSubmit = await request({
      hostname: HOST, port: PORT, path: '/api/complaints', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken }
    }, { title: 'Test', category: 'Hostel', location: 'Hall', description: 'Desc' });
    assert(cmpAdminSubmit.status === 403, 'Complaint submission restricts to students only (admin got 403)');

    // 13. Complaint: Validation error for bad category
    const badCat = await request({
      hostname: HOST, port: PORT, path: '/api/complaints', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + student1Token }
    }, { title: 'AC broken', category: 'AlienSpaceShip', location: 'Room 1', description: 'Desc' });
    assert(badCat.status === 400, 'Complaint rejects invalid enum category (400)');

    // 14. Complaint: Valid submission with tamper attempts
    const validCmp = await request({
      hostname: HOST, port: PORT, path: '/api/complaints', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + student1Token }
    }, {
      title: 'Library WiFi connectivity issue',
      category: 'Infrastructure',
      location: 'Central Library 2nd Floor',
      description: 'Access point cuts out frequently during study hours.',
      priority: 'High',
      status: 'Resolved', // Tamper attempt
      student: admin._id // Tamper attempt
    });
    assert(validCmp.status === 201, 'Complaint submitted successfully (201)');
    assert(validCmp.data.complaint.status === 'Pending', 'Complaint status forced to Pending');
    assert(validCmp.data.complaint.student._id === student1Id, 'Complaint owner strictly bound to token identity');
    const complaintId = validCmp.data.complaint._id;

    // 15. Notification: Verify complaint_lodged notification created for student
    const notifs1 = await request({
      hostname: HOST, port: PORT, path: '/api/notifications', method: 'GET',
      headers: { 'Authorization': 'Bearer ' + student1Token }
    });
    assert(notifs1.status === 200 && notifs1.data.notifications.some(n => n.type === 'complaint_lodged'), 'complaint_lodged notification automatically dispatched');

    // 16. Complaint: Student 1 gets complaints (sees own)
    const s1List = await request({
      hostname: HOST, port: PORT, path: '/api/complaints', method: 'GET',
      headers: { 'Authorization': 'Bearer ' + student1Token }
    });
    assert(s1List.status === 200 && s1List.data.count === 1, 'Student 1 sees their own complaint');

    // 17. Complaint: Student 2 gets complaints (isolated)
    const s2List = await request({
      hostname: HOST, port: PORT, path: '/api/complaints', method: 'GET',
      headers: { 'Authorization': 'Bearer ' + student2Token }
    });
    assert(s2List.status === 200 && s2List.data.count === 0, 'Student 2 isolated from Student 1 complaints (privacy)');

    // 18. Complaint: Admin sees all complaints
    const adminList = await request({
      hostname: HOST, port: PORT, path: '/api/complaints', method: 'GET',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    assert(adminList.status === 200 && adminList.data.count === 1, 'Admin sees all complaints across campus');

    // 19. Complaint ID retrieval: owner vs non-owner vs admin
    const getOwner = await request({
      hostname: HOST, port: PORT, path: '/api/complaints/' + complaintId, method: 'GET',
      headers: { 'Authorization': 'Bearer ' + student1Token }
    });
    assert(getOwner.status === 200, 'Owner student retrieves complaint by ID (200)');

    const getNonOwner = await request({
      hostname: HOST, port: PORT, path: '/api/complaints/' + complaintId, method: 'GET',
      headers: { 'Authorization': 'Bearer ' + student2Token }
    });
    assert(getNonOwner.status === 403, 'Non-owner student viewing other complaint rejected (403)');

    const getAdmin = await request({
      hostname: HOST, port: PORT, path: '/api/complaints/' + complaintId, method: 'GET',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    assert(getAdmin.status === 200, 'Admin retrieves complaint by ID (200)');

    // 20. Complaint Status: Student rejected, Admin succeeds
    const stuStatusFail = await request({
      hostname: HOST, port: PORT, path: '/api/complaints/' + complaintId + '/status', method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + student1Token }
    }, { status: 'Resolved' });
    assert(stuStatusFail.status === 403, 'Student status update rejected (403)');

    const adminStatusOk = await request({
      hostname: HOST, port: PORT, path: '/api/complaints/' + complaintId + '/status', method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken }
    }, { status: 'In Progress', message: 'Network engineering team dispatched to inspect router.' });
    assert(adminStatusOk.status === 200 && adminStatusOk.data.complaint.status === 'In Progress', 'Admin updates complaint status to In Progress (200)');
    assert(adminStatusOk.data.complaint.statusTimeline.length === 2, 'statusTimeline appended with audit entry');

    // 21. Admin Response: Student rejected, Admin succeeds
    const stuRespFail = await request({
      hostname: HOST, port: PORT, path: '/api/complaints/' + complaintId + '/responses', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + student1Token }
    }, { message: 'Student response' });
    assert(stuRespFail.status === 403, 'Student admin response submission rejected (403)');

    const adminRespOk = await request({
      hostname: HOST, port: PORT, path: '/api/complaints/' + complaintId + '/responses', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken }
    }, { message: 'Firmware upgraded on AP-201. Please re-test.' });
    assert(adminRespOk.status === 201 && adminRespOk.data.complaint.adminResponses.length === 1, 'Admin adds official response (201)');

    // 22. Notifications: Student 1 has 3 notifications (complaint_lodged, status_update, admin_response)
    const notifs2 = await request({
      hostname: HOST, port: PORT, path: '/api/notifications', method: 'GET',
      headers: { 'Authorization': 'Bearer ' + student1Token }
    });
    assert(notifs2.status === 200 && notifs2.data.count === 3, 'Student 1 has all 3 event notifications');
    assert(notifs2.data.unreadCount === 3, 'All 3 notifications initially marked unread');

    // 23. Notifications: Student 2 isolation
    const notifsS2 = await request({
      hostname: HOST, port: PORT, path: '/api/notifications', method: 'GET',
      headers: { 'Authorization': 'Bearer ' + student2Token }
    });
    assert(notifsS2.status === 200 && notifsS2.data.count === 0, 'Student 2 receives 0 notifications from Student 1');

    // 24. Notifications: Read single & Read all
    const targetNotifId = notifs2.data.notifications[0]._id;
    const markSingle = await request({
      hostname: HOST, port: PORT, path: '/api/notifications/' + targetNotifId + '/read', method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + student1Token }
    });
    assert(markSingle.status === 200 && markSingle.data.notification.isRead === true, 'Single notification marked as read');

    const markAll = await request({
      hostname: HOST, port: PORT, path: '/api/notifications/read-all', method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + student1Token }
    });
    assert(markAll.status === 200, 'All notifications marked as read');

    const notifsFinal = await request({
      hostname: HOST, port: PORT, path: '/api/notifications', method: 'GET',
      headers: { 'Authorization': 'Bearer ' + student1Token }
    });
    assert(notifsFinal.data.unreadCount === 0, 'Unread count verified at 0');

    // 25. Error handling: Malformed JSON payload
    const badJson = await request({
      hostname: HOST, port: PORT, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, '{ bad-json: ');
    assert(badJson.status === 400 && badJson.data.success === false, 'Malformed JSON caught gracefully with 400');

    // 26. Error handling: Non-existent route
    const route404 = await request({ hostname: HOST, port: PORT, path: '/api/nonexistent', method: 'GET' });
    assert(route404.status === 404, 'Unrecognized routes return consistent 404 JSON');

    console.log('--------------------------------------------------');
    console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('--------------------------------------------------');

    // Cleanup test database
    await mongoose.connection.dropDatabase();
    console.log('  [✓] Test database cleaned up successfully.');
  } catch (err) {
    console.error('TEST RUNNER EXCEPTION:', err);
    failed++;
  } finally {
    server.close(() => {
      mongoose.connection.close();
      process.exit(failed > 0 ? 1 : 0);
    });
  }
};

run();
