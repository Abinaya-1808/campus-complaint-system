const nodemailer = require('nodemailer');

function getCleanCredentials() {
  let user = (process.env.EMAIL_USER || '').trim().replace(/^['"]+|['"]+$/g, '');
  let pass = (process.env.EMAIL_PASS || process.env.EMAIL_APP_PASSWORD || '').trim().replace(/^['"]+|['"]+$/g, '');
  pass = pass.replace(/\s+/g, '');
  return { user, pass };
}

function isEmailConfigured() {
  const { user, pass } = getCleanCredentials();
  return Boolean(user && user.length > 0 && pass && pass.length > 0);
}

function createTransporter() {
  if (!isEmailConfigured()) {
    return null;
  }

  const { user, pass } = getCleanCredentials();
  const service = process.env.EMAIL_SERVICE ? process.env.EMAIL_SERVICE.trim().toLowerCase().replace(/^['"]+|['"]+$/g, '') : null;

  if (service && service === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
  }

  const host = (process.env.EMAIL_HOST || 'smtp.gmail.com').trim().replace(/^['"]+|['"]+$/g, '');
  const port = parseInt(process.env.EMAIL_PORT, 10) || 465;
  const secure = process.env.EMAIL_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    }
  });
}

let transporter = null;
function getTransporter() {
  if (!transporter && isEmailConfigured()) {
    try {
      transporter = createTransporter();
    } catch (err) {
      console.error('[EmailService] Transporter initialization failed:', err.message);
      transporter = null;
    }
  }
  return transporter;
}

function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'unknown';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length <= 2 ? name[0] + '*' : name.slice(0, 2) + '*'.repeat(name.length - 2);
  return `${maskedName}@${domain}`;
}

async function sendMail({ to, subject, html, text }) {
  if (!isEmailConfigured()) {
    console.log('[EmailService] Email sending skipped: EMAIL_USER or EMAIL_PASS not configured in environment.');
    return { sent: false, reason: 'not_configured' };
  }

  if (!to || typeof to !== 'string' || !to.includes('@')) {
    console.warn('[EmailService] Email skipped: Invalid recipient address.');
    return { sent: false, reason: 'invalid_recipient' };
  }

  const currentTransporter = getTransporter();
  if (!currentTransporter) {
    console.warn('[EmailService] Email skipped: Transporter not available.');
    return { sent: false, reason: 'transporter_unavailable' };
  }

  const { user } = getCleanCredentials();
  let from = (process.env.EMAIL_FROM || '').trim().replace(/^['"]+|['"]+$/g, '');
  if (!from) {
    from = `"Campus Complaint System" <${user}>`;
  }

  const mailOptions = {
    from,
    to: to.trim(),
    subject,
    text,
    html
  };

  try {
    const info = await currentTransporter.sendMail(mailOptions);
    console.log(`[EmailService] Email delivered successfully to ${maskEmail(to)}. MessageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EmailService] Failed delivering email to ${maskEmail(to)}:`, error.message);
    return { sent: false, error: error.message };
  }
}

async function verifyEmailConfig() {
  if (!isEmailConfigured()) {
    const { user, pass } = getCleanCredentials();
    return { 
      configured: false, 
      hasUser: Boolean(user), 
      hasPass: Boolean(pass),
      error: 'EMAIL_USER or EMAIL_PASS not set in environment variables' 
    };
  }
  const currentTransporter = getTransporter();
  if (!currentTransporter) {
    return { configured: false, error: 'Could not create transport' };
  }
  try {
    await currentTransporter.verify();
    return { configured: true, verified: true };
  } catch (err) {
    return { configured: true, verified: false, error: err.message };
  }
}

const FRONTEND_BASE_URL = (process.env.FRONTEND_URL || 'https://campus-complaint-system-frontend.vercel.app').replace(/\/+$/, '');

function wrapHtmlEmail({ title, preheader, bodyContent, ctaText, ctaUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b; margin: 0; padding: 0; line-height: 1.6; }
    .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%); color: #ffffff; padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 30px 24px; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #0f172a; }
    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .status-badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .status-pending { background-color: #fef3c7; color: #92400e; }
    .status-progress { background-color: #dbeafe; color: #1e40af; }
    .status-resolved { background-color: #dcfce7; color: #166534; }
    .status-rejected { background-color: #fee2e2; color: #991b1b; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .info-label { color: #64748b; font-weight: 600; }
    .info-val { color: #0f172a; font-weight: 700; }
    .btn-container { text-align: center; margin: 30px 0 10px; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 700; font-size: 15px; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div style="display:none; font-size:1px; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
    ${preheader || title}
  </div>
  <div class="container">
    <div class="header">
      <h1>Campus Complaint System</h1>
      <p>Official Student Grievance & Resolution Portal</p>
    </div>
    <div class="content">
      ${bodyContent}
      ${ctaText && ctaUrl ? `
        <div class="btn-container">
          <a href="${ctaUrl}" class="btn" target="_blank">${ctaText}</a>
        </div>
      ` : ''}
    </div>
    <div class="footer">
      <p>This is an automated notification from the Campus Complaint System.</p>
      <p>© 2026 Campus Administration. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

async function sendStatusUpdateEmail(student, complaint, newStatus, adminNote) {
  if (!student || !student.email) return { sent: false, reason: 'missing_student_email' };

  const complaintIdShort = String(complaint._id).slice(-6).toUpperCase();
  const ctaUrl = `${FRONTEND_BASE_URL}/pages/complaint-details.html?id=${complaint._id}`;

  let statusBadgeClass = 'status-pending';
  let statusMessageText = '';

  if (newStatus === 'In Progress') {
    statusBadgeClass = 'status-progress';
    statusMessageText = 'The relevant department is actively investigating and working on resolving your complaint.';
  } else if (newStatus === 'Resolved') {
    statusBadgeClass = 'status-resolved';
    statusMessageText = 'Your complaint has been marked as Resolved. Please log in to confirm the issue has been fixed and rate the resolution service.';
  } else if (newStatus === 'Rejected') {
    statusBadgeClass = 'status-rejected';
    statusMessageText = 'Your complaint status was updated to Rejected. Please review the administrator remarks for details.';
  } else {
    statusMessageText = `Your complaint status has been updated to "${newStatus}".`;
  }

  const subject = `[Status: ${newStatus}] Complaint #${complaintIdShort} - ${complaint.title}`;
  const studentName = student.name || 'Student';

  const bodyContent = `
    <div class="greeting">Hello ${studentName},</div>
    <p>There is an update on your complaint submitted to the Campus Complaint System.</p>

    <div class="card">
      <div style="margin-bottom: 14px; text-align: center;">
        <span class="status-badge ${statusBadgeClass}">${newStatus}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Complaint ID:</span>
        <span class="info-val">#${complaintIdShort}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Title:</span>
        <span class="info-val">${complaint.title}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Category:</span>
        <span class="info-val">${complaint.category || 'General'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Department:</span>
        <span class="info-val">${complaint.department || 'Campus Administration'}</span>
      </div>
    </div>

    <p style="font-size: 14.5px; color: #334155;">${statusMessageText}</p>

    ${adminNote ? `
      <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <strong style="color: #1e40af; display: block; margin-bottom: 4px;">Administrator Note:</strong>
        <p style="margin: 0; color: #1e3a8a; font-size: 14px;">${adminNote}</p>
      </div>
    ` : ''}
  `;

  const html = wrapHtmlEmail({
    title: subject,
    preheader: `Your complaint #${complaintIdShort} status is now ${newStatus}`,
    bodyContent,
    ctaText: 'View Complaint Details →',
    ctaUrl
  });

  const text = `Hello ${studentName},

Your complaint #${complaintIdShort} ("${complaint.title}") status has been updated to ${newStatus}.
${statusMessageText}
${adminNote ? '\nAdmin Note: ' + adminNote : ''}

Department: ${complaint.department || 'Campus Administration'}
View details online: ${ctaUrl}

Campus Complaint System`;

  return await sendMail({ to: student.email, subject, html, text });
}

async function sendAdminReplyEmail(student, complaint, replyMessage) {
  if (!student || !student.email) return { sent: false, reason: 'missing_student_email' };

  const complaintIdShort = String(complaint._id).slice(-6).toUpperCase();
  const ctaUrl = `${FRONTEND_BASE_URL}/pages/complaint-details.html?id=${complaint._id}`;
  const studentName = student.name || 'Student';
  const subject = `[New Reply] Administrator responded to Complaint #${complaintIdShort}`;

  const bodyContent = `
    <div class="greeting">Hello ${studentName},</div>
    <p>An administrator has posted an official response regarding your complaint:</p>

    <div class="card" style="margin-bottom: 14px;">
      <div class="info-row">
        <span class="info-label">Complaint ID:</span>
        <span class="info-val">#${complaintIdShort}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Title:</span>
        <span class="info-val">${complaint.title}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Current Status:</span>
        <span class="info-val">${complaint.status}</span>
      </div>
    </div>

    <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 18px; margin: 20px 0; border-radius: 6px;">
      <strong style="color: #15803d; display: block; margin-bottom: 6px;">Administrator Reply:</strong>
      <p style="margin: 0; color: #14532d; font-size: 14.5px; white-space: pre-line;">${replyMessage}</p>
    </div>

    <p style="font-size: 14px; color: #475569;">You can log in to view the response history or submit additional information if required.</p>
  `;

  const html = wrapHtmlEmail({
    title: subject,
    preheader: `New admin response on complaint #${complaintIdShort}`,
    bodyContent,
    ctaText: 'View Reply Online →',
    ctaUrl
  });

  const text = `Hello ${studentName},

An administrator has replied to your complaint #${complaintIdShort} ("${complaint.title}"):

"${replyMessage}"

View online: ${ctaUrl}

Campus Complaint System`;

  return await sendMail({ to: student.email, subject, html, text });
}

async function sendComplaintConfirmationEmail(student, complaint) {
  if (!student || !student.email) return { sent: false, reason: 'missing_student_email' };

  const complaintIdShort = String(complaint._id).slice(-6).toUpperCase();
  const ctaUrl = `${FRONTEND_BASE_URL}/pages/complaint-details.html?id=${complaint._id}`;
  const studentName = student.name || 'Student';
  const subject = `[Confirmed] Complaint #${complaintIdShort} Lodged Successfully`;

  const bodyContent = `
    <div class="greeting">Hello ${studentName},</div>
    <p>Your complaint has been successfully lodged with the Campus Complaint Portal and assigned to the appropriate department for review.</p>

    <div class="card">
      <div class="info-row">
        <span class="info-label">Complaint ID:</span>
        <span class="info-val">#${complaintIdShort}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Title:</span>
        <span class="info-val">${complaint.title}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Category:</span>
        <span class="info-val">${complaint.category}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Assigned Department:</span>
        <span class="info-val">${complaint.department || 'Campus Administration'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Priority:</span>
        <span class="info-val">${complaint.priority}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Status:</span>
        <span class="info-val" style="color: #d97706;">Pending</span>
      </div>
    </div>

    <p style="font-size: 14px; color: #475569;">You will receive email notifications as soon as an administrator takes action or updates the status.</p>
  `;

  const html = wrapHtmlEmail({
    title: subject,
    preheader: `Your complaint #${complaintIdShort} was lodged successfully`,
    bodyContent,
    ctaText: 'Track Complaint Status →',
    ctaUrl
  });

  const text = `Hello ${studentName},

Your complaint #${complaintIdShort} ("${complaint.title}") has been lodged successfully and auto-routed to ${complaint.department || 'Campus Administration'}.

Current Status: Pending
Track your complaint online: ${ctaUrl}

Campus Complaint System`;

  return await sendMail({ to: student.email, subject, html, text });
}

module.exports = {
  isEmailConfigured,
  sendMail,
  verifyEmailConfig,
  maskEmail,
  sendStatusUpdateEmail,
  sendAdminReplyEmail,
  sendComplaintConfirmationEmail
};
