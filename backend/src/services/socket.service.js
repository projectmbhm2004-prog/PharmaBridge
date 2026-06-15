// ============================================================
//  Socket.io service
// ============================================================
// Helper for emitting real-time events to a specific user.
// Each connected user joins a room named `user_${userId}` (see app.js),
// so we can target a single user regardless of how many tabs/devices
// they have open.
// ============================================================

/**
 * Emit a Socket.io event to one user's personal room.
 *
 * @param {import('express').Application} app  Express app (holds io via app.get('io'))
 * @param {number|string} userId               recipient user id
 * @param {string} event                        event name
 * @param {*} data                              payload
 */
function emitToUser(app, userId, event, data) {
  try {
    const io = app.get('io');
    if (!io) {
      console.warn('[socket] io not initialised on app');
      return;
    }
    io.to(`user_${userId}`).emit(event, data);
  } catch (err) {
    // Realtime delivery is best-effort; never break the request flow.
    console.error('[socket] emitToUser failed:', err.message);
  }
}

module.exports = { emitToUser };
