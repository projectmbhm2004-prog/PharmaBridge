// ============================================================
//  Error handling middleware
// ============================================================
// - AppError: small operational-error class with an HTTP status code
// - errorHandler: final Express error middleware (uniform JSON shape)
// - notFound: 404 handler for unmatched routes
// ============================================================

/**
 * Operational error with an attached HTTP status code.
 * Throw `new AppError('message', 400)` anywhere and it will be
 * surfaced to the client with the right status.
 */
class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   */
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode || 500;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 handler — mounted after all routes.
 * Express 5: no path means "anything that fell through".
 */
function notFound(req, res, next) {
  res.status(404).json({ success: false, message: 'Route not found' });
}

/**
 * Final error middleware. Must keep the 4-argument signature so
 * Express recognises it as an error handler.
 * Always returns { success: false, message: string }.
 * Never exposes stack traces to the client.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode && Number.isInteger(err.statusCode)
    ? err.statusCode
    : 500;

  // Log full error server-side (stack stays on the server only).
  if (statusCode >= 500) {
    console.error('[error]', err);
  } else {
    console.warn('[error]', err.message);
  }

  // For unexpected (non-operational) 500s, hide the real message.
  const message = statusCode >= 500 && !err.isOperational
    ? 'Internal server error'
    : err.message || 'Something went wrong';

  res.status(statusCode).json({ success: false, message });
}

module.exports = { AppError, errorHandler, notFound };
