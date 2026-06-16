// auth controller - register / verify-email / login / me.
// every handler is try/catch -> next(err), and the register insert runs in a transaction
// so a half-created user/profile rolls back cleanly.

const crypto = require('crypto');
const dns = require('dns');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = require('../config/db');
const { sendEmail } = require('../services/email.service');
const { emitToUser } = require('../services/socket.service');

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = ['company', 'pharmacy', 'driver'];

// returns an error string if the password is too weak, or null if it's fine
function validatePassword(password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (!/[!@#$%^&*]/.test(password)) {
    return 'Password must contain at least one special character (!@#$%^&*)';
  }
  return null;
}

// quick sanity check that the email domain can actually receive mail (has MX records),
// stops a lot of typo'd / fake signups before we bother sending anything
async function domainHasMx(email) {
  const domain = email.split('@')[1];
  if (!domain) return false;
  try {
    const records = await dns.promises.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch (err) {
    // no DNS in this env (CI, offline dev) - don't block signup over it, just let it through
    console.warn('[auth] DNS MX check skipped:', err.message);
    return true;
  }
}

// POST /api/auth/register
async function register(req, res, next) {
  let conn;
  try {
    const {
      email,
      password,
      role,
      // company / pharmacy fields
      name,
      phone,
      address,
      description,
      owner_name,
      // driver-only fields
      company_id,
      full_name,
      vehicle_info,
    } = req.body || {};

    // trim these two up front, they're required for everyone and shown publicly
    const descriptionTrimmed =
      typeof description === 'string' ? description.trim() : '';
    const addressTrimmed = typeof address === 'string' ? address.trim() : '';

    console.log('[register] called for email:', email, 'role:', role)

    // bail early on anything obviously bad before we hit the DB
    if (!email || !EMAIL_REGEX.test(email)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid email format' });
    }

    if (!(await domainHasMx(email))) {
      return res
        .status(400)
        .json({ success: false, message: 'This email domain does not exist' });
    }

    const pwError = validatePassword(password);
    if (pwError) {
      return res.status(400).json({ success: false, message: pwError });
    }

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be one of: company, pharmacy, driver',
      });
    }

    // role-specific required fields
    if (role === 'company' || role === 'pharmacy') {
      if (!name) {
        return res
          .status(400)
          .json({ success: false, message: 'Name is required' });
      }
    }
    if (role === 'driver') {
      if (!company_id || !full_name) {
        return res.status(400).json({
          success: false,
          message: 'company_id and full_name are required',
        });
      }
    }

    // description + address are required for every role since they show up publicly
    if (!descriptionTrimmed) {
      return res
        .status(400)
        .json({ success: false, message: 'Description is required' });
    }
    if (!addressTrimmed) {
      return res
        .status(400)
        .json({ success: false, message: 'Address is required' });
    }
    if (addressTrimmed.length > 255) {
      return res.status(400).json({
        success: false,
        message: 'Address must be 255 characters or fewer',
      });
    }

    // is this email already taken?
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (existing.length > 0) {
      return res
        .status(409)
        .json({ success: false, message: 'Email is already registered' });
    }

    // driver picks a company to apply to - make sure it actually exists before we start the tx
    let companyRow = null;
    if (role === 'driver') {
      const [companies] = await pool.query(
        'SELECT id, user_id, name FROM companies WHERE id = ? LIMIT 1',
        [company_id]
      );
      if (companies.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: 'Company not found' });
      }
      companyRow = companies[0];
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // random token they'll click in the verification email
    const token = crypto.randomBytes(32).toString('hex');

    // user row + the role profile row go in together, all-or-nothing
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [userResult] = await conn.query(
      `INSERT INTO users
         (email, password_hash, role, is_active, email_verified, email_verification_token)
       VALUES (?, ?, ?, FALSE, FALSE, ?)`,
      [email, passwordHash, role, token]
    );
    const userId = userResult.insertId;

    // what we'll call them in notifications / emails (drivers use full_name, set below)
    let displayName = name;

    if (role === 'company') {
      await conn.query(
        `INSERT INTO companies
           (user_id, name, phone, address, description, registration_status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [userId, name, phone || null, addressTrimmed, descriptionTrimmed]
      );
    } else if (role === 'pharmacy') {
      await conn.query(
        `INSERT INTO pharmacies
           (user_id, name, phone, address, description, owner_name, registration_status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [userId, name, phone || null, addressTrimmed, descriptionTrimmed, owner_name || null]
      );
    } else if (role === 'driver') {
      displayName = full_name;
      await conn.query(
        `INSERT INTO drivers
           (user_id, company_id, full_name, phone, vehicle_info, address, description, registration_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [userId, company_id, full_name, phone || null, vehicle_info || null, addressTrimmed, descriptionTrimmed]
      );
    }

    await conn.commit();
    conn.release();
    conn = null;

    // send the verification email, but best-effort - if mail is down we still keep the account,
    // they just won't get the link (and we log why below)
    const frontendUrl = req.headers.origin || process.env.CLIENT_URL || 'http://localhost:5173';
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;
    try {
      const info = await sendEmail({
        to: email,
        subject: 'Verify your email — PharmaBridge',
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
            <h2 style="color:#166534">Welcome to PharmaBridge</h2>
            <p>Thank you for registering. Please verify your email address to continue.</p>
            <p style="text-align:center;margin:32px 0">
              <a href="${verifyUrl}"
                 style="background:#166534;color:#fff;text-decoration:none;
                        padding:12px 28px;border-radius:8px;display:inline-block">
                Verify Email
              </a>
            </p>
            <p style="color:#64748b;font-size:13px">
              If the button doesn't work, copy this link into your browser:<br>
              <a href="${verifyUrl}">${verifyUrl}</a>
            </p>
          </div>`,
      });
      // log what nodemailer reported back, saved us hours chasing "email not arriving" reports
      console.log('[auth] verification email sent:', {
        messageId: info && info.messageId,
        accepted: info && info.accepted,
        rejected: info && info.rejected,
        response: info && info.response,
      });
    } catch (mailErr) {
      console.error('[auth] verification email failed:', mailErr.message);
    }

    return res.status(201).json({
      success: true,
      message:
        'Registration submitted. Please check your email to verify your account.',
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.error('[auth] rollback failed:', rbErr.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// GET /api/auth/verify-email?token=
async function verifyEmail(req, res, next) {
  try {
    const { token } = req.query;

    console.log('[verify-email] called for token:', token?.substring(0, 10))

    if (!token) {
      return res
        .status(400)
        .json({ success: false, message: 'Verification token is required' });
    }

    // look the user up by the token - a bad/used token just won't match
    const [rows] = await pool.query(
      'SELECT id, role FROM users WHERE email_verification_token = ? LIMIT 1',
      [token]
    );
    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token',
      });
    }

    const userId = rows[0].id;
    const role = rows[0].role;

    // flip them to verified and wipe the token so it can't be reused
    await pool.query(
      `UPDATE users
          SET email_verified = TRUE, email_verification_token = NULL
        WHERE id = ?`,
      [userId]
    );

    // now that the email's confirmed, ping whoever needs to approve them.
    // company/pharmacy -> the admin, driver -> the company they applied to.
    try {
      if (role === 'company' || role === 'pharmacy') {
        console.log('[verify-email] sending notification to admin')
        const [admins] = await pool.query(
          "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
        );
        if (admins.length > 0) {
          const adminUserId = admins[0].id;
          const title = 'New registration request';
          const body = `A new ${role} has verified their email and is awaiting approval`;
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, body)
             VALUES (?, 'new_registration', ?, ?)`,
            [adminUserId, title, body]
          );
          emitToUser(req.app, adminUserId, 'new_registration', {
            role,
            message: 'New registration awaiting approval',
          });
        }
      } else if (role === 'driver') {
        const [drivers] = await pool.query(
          'SELECT company_id FROM drivers WHERE user_id = ? LIMIT 1',
          [userId]
        );
        if (drivers.length > 0) {
          const [companies] = await pool.query(
            'SELECT user_id FROM companies WHERE id = ? LIMIT 1',
            [drivers[0].company_id]
          );
          if (companies.length > 0) {
            const companyUserId = companies[0].user_id;
            const title = 'New driver registration request';
            const body =
              'A new driver has verified their email and is awaiting approval';
            await pool.query(
              `INSERT INTO notifications (user_id, type, title, body)
               VALUES (?, 'new_registration', ?, ?)`,
              [companyUserId, title, body]
            );
            emitToUser(req.app, companyUserId, 'new_driver_registration', {
              message: 'A new driver has verified their email',
            });
          }
        }
      }
    } catch (notifyErr) {
      // notification is a nice-to-have, don't fail verification if it blows up
      console.error(
        '[auth] verification notification failed:',
        notifyErr.message
      );
    }

    return res.json({
      success: true,
      message: 'Email verified successfully. Your account is pending approval.',
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Email and password are required' });
    }

    const [rows] = await pool.query(
      `SELECT id, email, password_hash, role, is_active, email_verified
         FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    if (rows.length === 0) {
      // same generic message whether the email or the password is wrong, don't leak which
      return res
        .status(401)
        .json({ success: false, message: 'Invalid email or password' });
    }
    const user = rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid email or password' });
    }

    // admins skip email verification, everyone else has to have clicked the link
    if (user.role !== 'admin' && !user.email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in',
      });
    }

    // verified but not yet approved by admin/company
    if (!user.is_active) {
      return res
        .status(403)
        .json({ success: false, message: 'Your account is pending approval' });
    }

    // a fired driver keeps a valid login otherwise, so block them here too
    if (user.role === 'driver') {
      const [drivers] = await pool.query(
        'SELECT is_fired FROM drivers WHERE user_id = ? LIMIT 1',
        [user.id]
      );
      if (drivers.length > 0 && drivers[0].is_fired) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been terminated',
        });
      }
    }

    const tokenPayload = {
      userId: user.id,
      role: user.role,
      email: user.email,
    };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: JWT_EXPIRY,
    });

    // only hand back the token + role, never the hash or the verification token
    return res.json({
      success: true,
      message: 'Login successful',
      data: { token, role: user.role },
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/auth/me (protected) - returns the role-specific profile for the logged-in user
async function me(req, res, next) {
  try {
    const { userId, role } = req.user;
    let profile = null;

    if (role === 'admin') {
      const [rows] = await pool.query(
        'SELECT id, email, role, created_at FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      profile = rows[0] || null;
    } else if (role === 'company') {
      const [rows] = await pool.query(
        `SELECT c.*, u.email
           FROM companies c
           JOIN users u ON u.id = c.user_id
          WHERE c.user_id = ? LIMIT 1`,
        [userId]
      );
      profile = rows[0] || null;
    } else if (role === 'pharmacy') {
      const [rows] = await pool.query(
        `SELECT p.*, u.email
           FROM pharmacies p
           JOIN users u ON u.id = p.user_id
          WHERE p.user_id = ? LIMIT 1`,
        [userId]
      );
      profile = rows[0] || null;
    } else if (role === 'driver') {
      const [rows] = await pool.query(
        `SELECT d.*, u.email
           FROM drivers d
           JOIN users u ON u.id = d.user_id
          WHERE d.user_id = ? LIMIT 1`,
        [userId]
      );
      profile = rows[0] || null;
    }

    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: 'Profile not found' });
    }

    return res.json({ success: true, data: profile });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, verifyEmail, login, me };
