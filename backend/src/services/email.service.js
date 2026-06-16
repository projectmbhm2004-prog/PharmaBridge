// thin wrapper over Resend - every outgoing email goes through sendEmail()

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// fire off an HTML email. resolves with Resend's send response.
async function sendEmail({ to, subject, html }) {
  try {
    // Resend free tier can only deliver to the account's verified test address.
    // In production, redirect every email to RESEND_TEST_EMAIL.
    let recipient = to;
    if (process.env.NODE_ENV === 'production') {
      console.log('[email] intended recipient (overridden in production):', to);
      recipient = process.env.RESEND_TEST_EMAIL;
    }

    const { data, error } = await resend.emails.send({
      from: 'PharmaBridge <onboarding@resend.dev>',
      to: [recipient],
      subject,
      html,
    });

    console.log('[email] resend response:', JSON.stringify(data));
    console.log('[email] resend error:', JSON.stringify(error));

    return { data, error };
  } catch (err) {
    // log the real reason, rethrow so the caller decides what to tell the user
    console.error('[email] failed to send:', err.message);
    throw err;
  }
}

module.exports = { sendEmail };
