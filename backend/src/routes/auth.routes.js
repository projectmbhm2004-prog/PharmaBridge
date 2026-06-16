// /api/auth - register, login, /me (protected), and email verification via ?token=

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
