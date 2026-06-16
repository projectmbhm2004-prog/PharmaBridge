// thin wrapper over the nodemailer transporter - every outgoing email goes through sendEmail()

const transporter = require('../config/nodemailer');

// fire off an HTML email. resolves with nodemailer's send info.
async function sendEmail({ to, subject, html }) {
  try {
    const from = `PharmaBridge <${process.env.EMAIL_USER}>`;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });

    return info;
  } catch (err) {
    // log the real reason, rethrow so the caller decides what to tell the user
    console.error('[email] failed to send:', err.message);
    throw err;
  }
}

module.exports = { sendEmail };
