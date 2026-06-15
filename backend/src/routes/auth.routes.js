// ============================================================
//  Auth routes  →  mounted at /api/auth
// ============================================================
//   POST /register        new registration (company/pharmacy/driver)
//   POST /login           login
//   GET  /me              current user data        (protected)
//   GET  /verify-email    email verification via ?token=
// ============================================================

const express = require('express');

const auth = require('../middleware/auth');
const {
  register,
  login,
  me,
  verifyEmail,
} = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/verify-email', verifyEmail);
router.get('/me', auth, me);

module.exports = router;
