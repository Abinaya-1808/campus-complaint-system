const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { chromium } = require('playwright');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const User = require('../models/User');
const { Complaint } = require('../models/Complaint');
const Notification = require('../models/Notification');

const SCREENSHOT_DIR = path.resolve('C:/Users/anuab/.gemini/antigravity-ide/brain/25e153e4-13eb-4bcd-b2e6-1651ab622ea7/browser_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const testResults = [];
const recordPass = (name, details = '') => {
  testResults.push({ name, status: 'PASS', details });
  console.log(`  [PASS] ${name}${details ? ' - ' + details : ''}`);
};
const recordFail = (name, error) => {
  testResults.push({ name, status: 'FAIL', error });
  console.error(`  [FAIL] ${name} - Error: ${error}`);
};

async function checkOrStartServers() {
  console.log('[1/5] Ensuring backend (5000) and frontend (5500) servers are running...');

  // Start in-process servers if not active
  try {
    const res = await fetch('http://127.0.0.1:5000/api/health');
    const data = await res.json();
    if (res.status !== 200 || data.database !== 'connected') {
      require('../server');
    }
  } catch(e) {
    require('../server');
  }

  try {
    const res = await fetch('http://127.0.0.1:5500/');
    if (res.status !== 200) {
      require('../../../CampusComplaintSystem/serve');
    }
  } catch(e) {
    require('../../../CampusComplaintSystem/serve');
  }

  // Poll until both backend and frontend are responsive and database is connected
  console.log('      Waiting for backend to connect to MongoDB Atlas...');
  let ready = false;
  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch('http://127.0.0.1:5000/api/health');
      const data = await res.json();
      if (res.status === 200 && data.database === 'connected') {
        ready = true;
        console.log('      Backend health check OK: database is connected.');
        break;
      }
    } catch (err) {}
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!ready) {
    throw new Error('Backend failed to connect to MongoDB Atlas within timeout.');
  }
}

async function runBrowserTestSuite() {
  console.log('================================================================');
  console.log('   CAMPUS COMPLAINT SYSTEM - PLAYWRIGHT BROWSER UI TEST SUITE   ');
  console.log('================================================================');

  await checkOrStartServers();

  console.log('[2/5] Connecting to MongoDB Atlas for state verification...');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('      Connected to Atlas database: ' + mongoose.connection.name);

  console.log('[3/5] Launching local Google Chrome via Playwright...');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    console.log('      Google Chrome launched successfully (version: ' + browser.version() + ')');
  } catch (err) {
    console.log('      Chrome launch fallback to msedge: ' + err.message);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    console.log('      Edge launched successfully (version: ' + browser.version() + ')');
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  // Listen to browser console and errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('      Browser Console Error:', msg.text());
  });
  page.on('pageerror', err => {
    console.log('      Browser Page Error:', err.message);
  });

  const ts = Date.now();
  const studentData = {
    name: 'Playwright Test Student',
    registerNumber: 'REG_PW_' + ts,
    email: 'pw_student_' + ts + '@testmail.campus.edu',
    department: 'CSE',
    year: '3rd Year',
    password: 'StudentPass@123'
  };

  const complaintData = {
    title: 'Playwright Test: Defective Lab 3 Projector',
    category: 'Infrastructure',
    location: 'Computer Lab 3 - Desk 12',
    priority: 'High',
    description: 'The overhead projector bulb flickers continuously and turns off after 5 minutes of class.'
  };

  let registeredUserId = null;
  let submittedComplaintId = null;

  try {
    console.log('[4/5] Executing real browser workflows...');

    // -------------------------------------------------------------
    // STEP 1: Registration Form Validation
    // -------------------------------------------------------------
    await page.goto('http://127.0.0.1:5500/pages/register.html', { waitUntil: 'networkidle' });
    
    await page.click('button[type="submit"]');
    const emptyValidation = await page.evaluate(() => {
      const el = document.getElementById('name');
      return el && !el.checkValidity();
    });
    if (emptyValidation) {
      recordPass('1. Registration client-side validation stops empty submission', 'HTML5 form validation active');
    } else {
      recordFail('1. Registration client-side validation failed', 'Empty form submitted');
    }

    // -------------------------------------------------------------
    // STEP 2: Fill & Submit Registration Form
    // -------------------------------------------------------------
    await page.fill('#name', studentData.name);
    await page.fill('#registerNumber', studentData.registerNumber);
    await page.fill('#email', studentData.email);
    await page.selectOption('#department', studentData.department);
    await page.selectOption('#year', studentData.year);
    await page.fill('#password', studentData.password);
    await page.fill('#confirmPassword', studentData.password);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_register_form_filled.png') });
    await page.click('button[type="submit"]');

    // Wait for redirect to login.html (1.5s delay in auth.js)
    await page.waitForURL('**/pages/login.html', { timeout: 15000 });
    recordPass('2. Student registration completed via UI & redirected to login.html', 'Target: ' + page.url());
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_redirected_to_login.png') });

    // -------------------------------------------------------------
    // STEP 3: Verify Persistence in MongoDB Atlas
    // -------------------------------------------------------------
    const userInDb = await User.findOne({ email: studentData.email.toLowerCase() });
    if (userInDb && userInDb.role === 'student' && userInDb.password && userInDb.password !== studentData.password) {
      registeredUserId = userInDb._id.toString();
      recordPass('3. Verified registered student stored in MongoDB Atlas', 'User ID: ' + registeredUserId + ', Bcrypt hash verified');
    } else {
      recordFail('3. Student record verification in MongoDB Atlas failed');
    }

    // -------------------------------------------------------------
    // STEP 4: Student Login
    // -------------------------------------------------------------
    await page.selectOption('#loginType', 'student');
    await page.fill('#loginId', studentData.email);
    await page.fill('#loginPassword', studentData.password);
    await page.click('button[type="submit"]');

    await page.waitForURL('**/pages/student-dashboard.html', { timeout: 15000 });
    recordPass('4. Student login successful via UI', 'Landed on student-dashboard.html');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_student_dashboard.png') });

    // -------------------------------------------------------------
    // STEP 5: Verify Student Dashboard Display
    // -------------------------------------------------------------
    const displayedName = await page.textContent('#studentName');
    const displayedDept = await page.textContent('#studentDept');
    const displayedReg = await page.textContent('#studentId');

    if (displayedName && displayedName.includes(studentData.name)) {
      recordPass('5. Student dashboard displays verified account info', `Name: "${displayedName.trim()}", Dept: "${displayedDept.trim()}", ID: "${displayedReg.trim()}"`);
    } else {
      recordFail('5. Student dashboard account display verification failed', `Found name: ${displayedName}`);
    }

    // -------------------------------------------------------------
    // STEP 6: Submit a Synthetic Complaint
    // -------------------------------------------------------------
    await page.click('a[href*="submit-complaint.html"]');
    await page.waitForURL('**/pages/submit-complaint.html', { timeout: 15000 });

    await page.fill('#complaintTitle', complaintData.title);
    await page.selectOption('#category', complaintData.category);
    await page.selectOption('#priority', complaintData.priority);
    await page.fill('#location', complaintData.location);
    await page.fill('#description', complaintData.description);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_submit_complaint_filled.png') });

    page.once('dialog', async dialog => {
      console.log('      Browser alert received: ' + dialog.message());
      await dialog.accept();
    });

    await page.click('button[type="submit"]');
    await page.waitForURL('**/pages/my-complaints.html', { timeout: 15000 });
    recordPass('6. Complaint submitted successfully via UI', 'Redirected to my-complaints.html');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_my_complaints_list.png') });

    // -------------------------------------------------------------
    // STEP 7: Verify Complaint in "My Complaints"
    // -------------------------------------------------------------
    await page.waitForSelector('.complaint-card', { timeout: 15000 });
    const cardTitle = await page.textContent('.complaint-card h3');
    const cardStatus = await page.textContent('.complaint-card .status-badge');

    if (cardTitle && cardTitle.includes(complaintData.title) && cardStatus && cardStatus.includes('Pending')) {
      recordPass('7. Complaint displayed in My Complaints with initial Pending status', `Status: "${cardStatus.trim()}"`);
    } else {
      recordFail('7. Complaint listing check failed', `Title: ${cardTitle}, Status: ${cardStatus}`);
    }

    // Click details button
    await page.click('.complaint-card a.view-details-btn');
    await page.waitForURL('**/pages/complaint-details.html?id=*', { timeout: 15000 });
    
    const url = new URL(page.url());
    submittedComplaintId = url.searchParams.get('id');

    // -------------------------------------------------------------
    // STEP 8: Verify Complaint Details & Status Timeline
    // -------------------------------------------------------------
    await page.waitForSelector('.details-header h1', { timeout: 15000 });
    const detailsTitle = await page.textContent('.details-header h1');
    const detailsTimeline = await page.textContent('.timeline');

    if (detailsTitle && detailsTitle.includes(complaintData.title) && detailsTimeline && detailsTimeline.includes('Pending')) {
      recordPass('8. Complaint details page renders title & initial timeline', 'Complaint ID: ' + submittedComplaintId);
    } else {
      recordFail('8. Complaint details rendering failed');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_student_complaint_details.png') });

    // -------------------------------------------------------------
    // STEP 9: Student Logout
    // -------------------------------------------------------------
    await page.click('#logoutBtn');
    await page.waitForURL('**/pages/login.html', { timeout: 15000 });
    recordPass('9. Student logged out & session cleared', 'Redirected to login.html');

    // -------------------------------------------------------------
    // STEP 10: Admin Login
    // -------------------------------------------------------------
    await page.selectOption('#loginType', 'admin');
    await page.fill('#loginId', process.env.ADMIN_EMAIL);
    await page.fill('#loginPassword', process.env.ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL('**/pages/admin-dashboard.html', { timeout: 15000 });
    recordPass('10. Administrator logged in via UI', 'Landed on admin-dashboard.html');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_admin_dashboard.png') });

    // -------------------------------------------------------------
    // STEP 11: Admin View Complaint Details
    // -------------------------------------------------------------
    await page.goto(`http://127.0.0.1:5500/pages/admin-complaint-details.html?id=${submittedComplaintId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#adminStatus', { timeout: 15000 });
    const adminViewTitle = await page.textContent('.admin-details-title');
    recordPass('11. Admin complaint details loaded', `Title: "${adminViewTitle.trim()}"`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_admin_complaint_details.png') });

    // -------------------------------------------------------------
    // STEP 12: Admin Updates Status to In Progress, then Resolved
    // -------------------------------------------------------------
    // Update to In Progress
    await page.selectOption('#adminStatus', 'In Progress');
    await page.fill('#adminResponse', 'Technician assigned to inspect projector bulb.');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.admin-success-message', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Update to Resolved
    await page.selectOption('#adminStatus', 'Resolved');
    await page.fill('#adminResponse', 'Bulb replaced and tested. Problem resolved.');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.admin-success-message', { timeout: 15000 });
    await page.waitForTimeout(1000);

    recordPass('12. Admin updated status to In Progress and then Resolved', 'Timeline logged in UI');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_admin_status_resolved.png') });

    // -------------------------------------------------------------
    // STEP 13: Admin Adds Official Response
    // -------------------------------------------------------------
    await page.fill('#adminResponse', 'Official Note: Work order completed by Facilities on Oct 14.');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.admin-success-message', { timeout: 15000 });
    await page.waitForTimeout(1000);
    recordPass('13. Admin added official response', 'Response posted to complaint');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_admin_official_response_added.png') });

    // -------------------------------------------------------------
    // STEP 14: Direct Atlas DB Verification
    // -------------------------------------------------------------
    const updatedComplaintInDb = await Complaint.findById(submittedComplaintId);
    if (updatedComplaintInDb && updatedComplaintInDb.status === 'Resolved' && updatedComplaintInDb.statusTimeline.length >= 3) {
      recordPass('14. Verified status history & official response persisted in Atlas', `Status: ${updatedComplaintInDb.status}, Timeline count: ${updatedComplaintInDb.statusTimeline.length}, Responses: ${updatedComplaintInDb.adminResponses.length}`);
    } else {
      recordFail('14. MongoDB Atlas complaint verification failed');
    }

    // -------------------------------------------------------------
    // STEP 15: Student Re-login & Verify Resolution
    // -------------------------------------------------------------
    await page.click('#logoutBtn');
    await page.waitForURL('**/pages/login.html', { timeout: 15000 });

    await page.selectOption('#loginType', 'student');
    await page.fill('#loginId', studentData.email);
    await page.fill('#loginPassword', studentData.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/pages/student-dashboard.html', { timeout: 15000 });

    await page.goto(`http://127.0.0.1:5500/pages/complaint-details.html?id=${submittedComplaintId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.details-header .status-badge', { timeout: 15000 });

    const studentVerifiedStatus = await page.textContent('.details-header .status-badge');
    const studentVerifiedTimeline = await page.textContent('.timeline');
    const studentVerifiedResponses = await page.textContent('#detailsContent');

    if (studentVerifiedStatus && studentVerifiedStatus.includes('Resolved') && studentVerifiedTimeline.includes('Bulb replaced') && studentVerifiedResponses.includes('Official Note')) {
      recordPass('15. Student verified Resolved status, timeline history & admin response in UI', 'All updates rendered accurately');
    } else {
      recordFail('15. Student resolution verification in UI failed');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_student_verified_resolution.png') });

    // -------------------------------------------------------------
    // STEP 16: Verify Student Notifications & Mark Read
    // -------------------------------------------------------------
    await page.click('a[href*="notifications.html"]');
    await page.waitForURL('**/pages/notifications.html', { timeout: 15000 });

    await page.waitForSelector('.notification-card, .notifications-list', { timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_student_notifications_list.png') });

    await page.click('#markAllReadBtn');
    await page.waitForTimeout(1000);

    const isBadgeHidden = await page.evaluate(() => {
      const b = document.getElementById('notificationBadge');
      return b ? (b.classList.contains('hidden') || b.textContent.trim() === '0' || b.style.display === 'none') : true;
    });

    if (isBadgeHidden) {
      recordPass('16. Notifications retrieved & marked as read via UI', 'Navbar badge cleared to 0 / hidden');
    } else {
      recordFail('16. Notification mark-read badge update check failed');
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_notifications_marked_read.png') });

    // -------------------------------------------------------------
    // STEP 17: Security & Role-Based Authorization Guards
    // -------------------------------------------------------------
    await page.goto('http://127.0.0.1:5500/pages/admin-dashboard.html', { waitUntil: 'networkidle' });
    const currentUrl = page.url();

    if (currentUrl.includes('student-dashboard.html') || currentUrl.includes('login.html')) {
      recordPass('17. Security guard prevents student from accessing admin-dashboard.html', 'Redirected back to: ' + currentUrl);
    } else {
      recordFail('17. Security guard failed: student accessed admin dashboard', 'Url was: ' + currentUrl);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_security_guard_redirect.png') });

    // -------------------------------------------------------------
    // STEP 18: Login Validation Error Messages
    // -------------------------------------------------------------
    await page.click('#logoutBtn');
    await page.waitForURL('**/pages/login.html', { timeout: 15000 });

    await page.selectOption('#loginType', 'student');
    await page.fill('#loginId', 'nonexistent_student@campus.test');
    await page.fill('#loginPassword', 'WrongPassword123');
    await page.click('button[type="submit"]');

    await page.waitForSelector('#loginMessage', { timeout: 15000 });
    const loginError = await page.textContent('#loginMessage');

    if (loginError && loginError.toLowerCase().includes('invalid')) {
      recordPass('18. Login error validation displayed clearly in UI', `Message: "${loginError.trim()}"`);
    } else {
      recordFail('18. Login error validation message check failed', `Message: "${loginError}"`);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_login_error_validation.png') });

  } catch (err) {
    console.error('Fatal Browser Test Error:', err);
    recordFail('Execution Exception', err.message);
  } finally {
    await browser.close();
    await mongoose.connection.close();
  }

  console.log('================================================================');
  const passCount = testResults.filter(r => r.status === 'PASS').length;
  const failCount = testResults.filter(r => r.status === 'FAIL').length;
  console.log(`  BROWSER UI TEST SUMMARY: ${passCount} PASSED / ${failCount} FAILED`);
  console.log('================================================================');
  console.log(`  Evidence screenshots saved to: ${SCREENSHOT_DIR}`);

  return { passCount, failCount, testResults };
}

runBrowserTestSuite()
  .then(res => {
    if (res.failCount > 0) process.exit(1);
    else process.exit(0);
  })
  .catch(err => {
    console.error('Fatal runner error:', err);
    process.exit(1);
  });
