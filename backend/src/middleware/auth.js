// ============================================================
//  Authentication middleware — JWT verification
// ============================================================
// Extracts the Bearer token, verifies it with JWT_SECRET, and
// attaches the decoded payload to req.user.
// ============================================================

const jwt = require('jsonwebtoken');

const pool = require('../config/db');

/**
 * Protect a route: requires a valid Bearer JWT AND a still-active account.
 * On success: req.user = { userId, role, email }.
 * On failure: 401 { success: false, message: "Unauthorized" }.
 *
 * The JWT is valid for 7 days. Without a live status check, a company /
 * pharmacy / driver that was deactivated (or a driver that was fired)
 * mid-session would keep full API access until the token expired — making
 * the admin "deactivate" and company "fire" actions effectively useless for
 * the duration of the token. We therefore re-read users.is_active on every
 * authenticated request (an indexed primary-key lookup) and reject the
 * request the moment the account is no longer active. The frontend already
 * treats any 401 as "session ended" and bounces to /login, so a deactivated
 * user is logged out on their very next request.
 */
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';

    if (!header.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({ success: false, message: 'Unauthorized' });
    }

    const token = header.slice(7).trim();
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: 'Unauthorized' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Live account-status check (see note above). Mirrors the login gate so a
    // token cannot outlive a deactivation / firing.
    const [rows] = await pool.query(
      'SELECT is_active FROM users WHERE id = ? LIMIT 1',
      [decoded.userId]
    );
    if (rows.length === 0 || !rows[0].is_active) {
      return res
        .status(401)
        .json({ success: false, message: 'Account is inactive' });
    }

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      email: decoded.email,
    };

    return next();
  } catch (err) {
    // Invalid / expired token — never leak details.
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
}

module.exports = auth;
