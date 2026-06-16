// notifications - list the latest + unread count, mark one read, mark all read.
// any logged-in role can hit these. every handler does try/catch -> next(err).

const pool = require('../config/db');

// GET /api/notifications
async function getNotifications(req, res, next) {
  try {
    const userId = req.user.userId;

    const [notifications] = await pool.query(
      `SELECT * FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 20`,
      [userId]
    );

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );

    return res.json({
      success: true,
      data: { notifications, unread_count: countRows[0].unread_count },
    });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/notifications/read-all
async function markAllRead(req, res, next) {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
      [req.user.userId]
    );
    return res.json({
      success: true,
      message: 'All notifications marked as read.',
    });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/notifications/:id/read
async function markRead(req, res, next) {
  try {
    const { id } = req.params;

    // scope by user_id too so nobody can mark someone else's notification read
    const [rows] = await pool.query(
      'SELECT id FROM notifications WHERE id = ? AND user_id = ? LIMIT 1',
      [id, req.user.userId]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Notification not found' });
    }

    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ?', [id]);

    return res.json({
      success: true,
      message: 'Notification marked as read.',
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getNotifications,
  markAllRead,
  markRead,
};
