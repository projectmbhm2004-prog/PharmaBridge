// thin wrapper over Resend - every outgoing email goes through sendEmail()

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// fire off an HTML email. resolves with Resend's send response.
async function sendEmail({ to, subject, html }) {
  try {
    const result = await resend.emails.send({
      from: 'PharmaBridge <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    });

    return result;
  } catch (err) {
    // log the real reason, rethrow so the caller decides what to tell the user
    console.error('[email] failed to send:', err.message);
    throw err;
  }
}

module.exports = { sendEmail };
