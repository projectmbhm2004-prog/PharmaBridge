// ============================================================
//  Notifications routes  →  mounted at /api/notifications
// ============================================================
//  Auth required (any role) — no requireRole restriction.
//  NOTE: /read-all is registered BEFORE /:id/read so Express does
//  not treat "read-all" as an :id.
// ============================================================

const express = require('express');

const auth = require('../middleware/auth');
const {
  getNotifications,
  markAllRead,
  markRead,
} = require('../controllers/notifications.controller');

const router = express.Router();

// Authenticated users of any role.
router.use(auth);

router.get('/', getNotifications);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
