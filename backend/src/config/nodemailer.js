// one reusable Gmail SMTP transporter, built from env. the send logic itself is in services/email.service.js.

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // this is a Gmail App Password, not the real account password
  },
});

module.exports = transporter;
