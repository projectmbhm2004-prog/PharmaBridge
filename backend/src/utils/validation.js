// shared input-validation rules for registration. extracted verbatim from
// auth.controller.js so the controller and the tests exercise the SAME code.
// pure: no DB, no network, no req/res.

// an email is "valid enough" if it has a local part, an @, and a dotted domain.
// (same shape we use to bail early before hitting the DB on register)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// the roles a user is allowed to self-register as. admin is intentionally absent.
const ALLOWED_ROLES = ['company', 'pharmacy', 'driver'];

function isValidEmail(email) {
  return EMAIL_REGEX.test(email);
}

// returns an error string if the password is too weak, or null if it's fine
function passwordIssues(password) {
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

// boolean convenience wrapper over passwordIssues
function isStrongPassword(password) {
  return passwordIssues(password) === null;
}

function isAllowedRole(role) {
  return ALLOWED_ROLES.includes(role);
}

module.exports = {
  EMAIL_REGEX,
  ALLOWED_ROLES,
  isValidEmail,
  passwordIssues,
  isStrongPassword,
  isAllowedRole,
};
