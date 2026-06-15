// ============================================================
//  File upload middleware — Multer (memory storage)
// ============================================================
// Files are kept in memory as Buffers so they can be streamed
// straight to Cloudinary. Only images are accepted, max 5MB each.
// ============================================================

const multer = require('multer');

// Allowed MIME types for product / profile images.
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Reject anything that isn't an allowed image type.
 * Passing an Error (instead of throwing) lets Multer forward it to
 * the error pipeline cleanly.
 */
function fileFilter(req, file, cb) {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    return cb(null, true);
  }
  const err = new Error('Only JPEG, PNG, and WEBP images are allowed');
  err.statusCode = 400;
  return cb(err, false);
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

/**
 * Express error middleware that turns Multer errors into the uniform
 * 400 JSON response. Mount this right after the upload middleware on
 * routes that accept files, or rely on the global handler picking up
 * the statusCode we set below.
 */
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    let message = 'File upload error';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File too large. Maximum allowed size is 5MB';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Too many files or unexpected field name';
    }
    return res.status(400).json({ success: false, message });
  }

  // Custom file-filter rejection.
  if (err && err.statusCode === 400) {
    return res.status(400).json({ success: false, message: err.message });
  }

  return next(err);
}

module.exports = upload;
module.exports.upload = upload;
module.exports.handleUploadError = handleUploadError;
