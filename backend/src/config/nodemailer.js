// ============================================================
//  Nodemailer configuration — Gmail SMTP transporter
// ============================================================
// Builds a single reusable transporter from environment variables.
// The actual sending logic lives in services/email.service.js.
// ============================================================

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Gmail App Password
  },
});

module.exports = transporter;
