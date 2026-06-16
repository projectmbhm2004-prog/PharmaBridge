// /api/notifications - just needs auth, any role.
// /read-all goes before /:id/read so express doesn't read "read-all" as an :id.

const express = require('express');

const auth = require('../middleware/auth');
const {
  getNotifications,
  markAllRead,
  markRead,
} = require('../controllers/notifications.controller');

const router = express.Router();

// any logged-in user
router.use(auth);

router.get('/', getNotifications);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
