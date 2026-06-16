// our error plumbing: AppError (operational error + status code), errorHandler (the final
// express handler, uniform json), and notFound (404 for anything that fell through).

// throw `new AppError('message', 400)` anywhere and the handler below surfaces it with that status
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode || 500;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// catch-all 404, mounted after every route. express 5 lets us skip the path here.
function notFound(req, res, next) {
  res.status(404).json({ success: false, message: 'Route not found' });
}

// final error middleware. keep all 4 args or express won't treat it as an error handler.
// always { success: false, message }, and stack traces never go to the client.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode && Number.isInteger(err.statusCode)
    ? err.statusCode
    : 500;

  // full error stays server-side only
  if (statusCode >= 500) {
    console.error('[error]', err);
  } else {
    console.warn('[error]', err.message);
  }

  // for surprise 500s hide the real message, don't leak internals
  const message = statusCode >= 500 && !err.isOperational
    ? 'Internal server error'
    : err.message || 'Something went wrong';

  res.status(statusCode).json({ success: false, message });
}

module.exports = { AppError, errorHandler, notFound };
