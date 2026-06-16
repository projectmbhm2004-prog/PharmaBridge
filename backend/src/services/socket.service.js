// helper for pushing realtime events to a single user. everyone joins a `user_${userId}`
// room on connect (see app.js), so this hits all their open tabs/devices at once.

function emitToUser(app, userId, event, data) {
  try {
    const io = app.get('io');
    if (!io) {
      console.warn('[socket] io not initialised on app');
      return;
    }
    io.to(`user_${userId}`).emit(event, data);
  } catch (err) {
    // realtime is best-effort, never let a socket hiccup break the actual request
    console.error('[socket] emitToUser failed:', err.message);
  }
}

module.exports = { emitToUser };
