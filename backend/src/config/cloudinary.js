// ============================================================
//  Cloudinary configuration
// ============================================================
// Configures the Cloudinary v2 SDK from environment variables and
// exports the configured instance for use in upload/delete helpers.
// ============================================================

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // always return https URLs
});

module.exports = cloudinary;
