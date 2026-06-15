// ============================================================
//  Company routes  →  mounted at /api/company
// ============================================================
//  Every route requires a valid JWT (auth) + the 'company' role.
// ============================================================

const express = require('express');

const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const upload = require('../middleware/upload');
const { handleUploadError } = require('../middleware/upload');
const {
  getOrders,
  acceptOrder,
  rejectOrder,
  reassignDriver,
  getCategories,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImages,
  deleteProductImage,
  getProductUnits,
  addProductUnit,
  updateProductUnit,
  deleteProductUnit,
  getDrivers,
  acceptDriver,
  rejectDriver,
  fireDriver,
  deleteDriver,
  getFinancial,
  getPharmacyDebt,
  recordPayment,
  getMarket,
} = require('../controllers/company.controller');

const router = express.Router();

// Apply auth + company role to every route in this router.
router.use(auth, requireRole('company'));

// Orders
router.get('/orders', getOrders);
router.patch('/orders/:id/accept', acceptOrder);
router.patch('/orders/:id/reject', rejectOrder);
router.patch('/orders/:id/reassign', reassignDriver);

// Categories (general + this company's own)
router.get('/categories', getCategories);

// Products
router.get('/products', getProducts);
router.post('/products', createProduct);
router.patch('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

// Product images (Cloudinary, max 4 per upload)
router.post(
  '/products/:id/images',
  upload.array('images', 4),
  handleUploadError,
  uploadProductImages
);
router.delete('/products/:id/images/:imgId', deleteProductImage);

// Product packaging units (tiered pricing). The /units/:unitId routes are
// listed before /:id so their distinct path depth is unambiguous.
router.get('/products/:id/units', getProductUnits);
router.post('/products/:id/units', addProductUnit);
router.put('/products/units/:unitId', updateProductUnit);
router.delete('/products/units/:unitId', deleteProductUnit);

// Drivers
router.get('/drivers', getDrivers);
router.patch('/drivers/:id/accept', acceptDriver);
router.patch('/drivers/:id/reject', rejectDriver);
router.delete('/drivers/:id', fireDriver);
router.delete('/drivers/:id/delete', deleteDriver);

// Financial & marketplace
router.get('/financial', getFinancial);
router.get('/financial/pharmacy-debt/:pharmacy_id', getPharmacyDebt);
router.post('/financial/record-payment', recordPayment);
router.get('/market', getMarket);

module.exports = router;
