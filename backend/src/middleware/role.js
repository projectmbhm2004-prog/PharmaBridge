// role gate. requireRole('admin', 'company') only lets the request through when
// req.user.role is one of those. has to run AFTER auth, which is what sets req.user.

// builds a middleware locked to the roles you pass in
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
