// ============================================================
//  Role-based access control middleware
// ============================================================
// requireRole('admin', 'company') -> middleware that allows the
// request through only when req.user.role is one of the listed roles.
// Must run AFTER the auth middleware (which sets req.user).
// ============================================================

/**
 * Factory: build a middleware that restricts a route to the given roles.
 *
 * @param {...string} roles  allowed roles (e.g. 'admin', 'company')
 * @returns {Function} Express middleware
 */
function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user || !req.user.role) {
      return res
        .status(401)
        .json({ success: false, message: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    return next();
  };
}

module.exports = requireRole;
module.exports.requireRole = requireRole;
