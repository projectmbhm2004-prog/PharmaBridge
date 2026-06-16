// auth middleware - pull the Bearer token, verify it, hang the payload off req.user.

const jwt = require('jsonwebtoken');

const pool = require('../config/db');

// gate a route behind a valid JWT AND an account that's still active.
// success -> req.user = { userId, role, email }, failure -> 401.
// the token lives 7 days, so without a fresh status check a deactivated company/pharmacy
// or a fired driver would keep full access until it expired - making admin "deactivate" and
// company "fire" basically toothless. so we re-read users.is_active on every request (cheap,
// it's a PK lookup) and bounce the moment they're not active. the frontend treats any 401 as
// "session over" and kicks to /login, so they're logged out on their very next call.
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

    // the live is_active check from the note above - mirrors the login gate
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
    // bad or expired token - stay vague, don't hand attackers details
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
}

module.exports = auth;
