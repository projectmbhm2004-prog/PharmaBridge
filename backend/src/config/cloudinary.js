// cloudinary v2 set up from env. the upload/delete helpers import this configured instance.

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // force https urls, mixed-content warnings otherwise
});

module.exports = cloudinary;
