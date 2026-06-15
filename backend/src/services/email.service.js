// ============================================================
//  Email service
// ============================================================
// Thin wrapper around the configured Nodemailer transporter.
// All outgoing mail goes through sendEmail().
// ============================================================

const transporter = require('../config/nodemailer');

/**
 * Send an HTML email.
 *
 * @param {Object} params
 * @param {string} params.to       recipient address
 * @param {string} params.subject  email subject
 * @param {string} params.html     HTML body
 * @returns {Promise<Object>} nodemailer send info
 */
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
    // Surface a clean message but log the real error server-side.
    console.error('[email] failed to send:', err.message);
    throw err;
  }
}

module.exports = { sendEmail };
