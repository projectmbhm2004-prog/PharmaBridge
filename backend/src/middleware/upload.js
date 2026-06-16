// multer with memory storage - we keep files as Buffers and stream them straight to
// Cloudinary, so no temp files on disk. images only, 5MB cap.

const multer = require('multer');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// pass an Error back instead of throwing so multer routes it into its own error pipeline cleanly
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

// turns multer's errors into our standard 400 json shape. drop this right after the upload
// middleware on file routes, or just let the global handler catch the statusCode we set.
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

  // this is the reject from fileFilter above
  if (err && err.statusCode === 400) {
    return res.status(400).json({ success: false, message: err.message });
  }

  return next(err);
}

module.exports = upload;
module.exports.upload = upload;
module.exports.handleUploadError = handleUploadError;
