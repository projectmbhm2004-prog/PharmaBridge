// /api/company - all routes need a valid JWT + the 'company' role

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

// company role on everything below
router.use(auth, requireRole('company'));

// orders
router.get('/orders', getOrders);
router.patch('/orders/:id/accept', acceptOrder);
router.patch('/orders/:id/reject', rejectOrder);
router.patch('/orders/:id/reassign', reassignDriver);

// categories - the shared ones plus this company's own
router.get('/categories', getCategories);

// products
router.get('/products', getProducts);
router.post('/products', createProduct);
router.patch('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

// product images, up to 4 per upload (Cloudinary)
router.post(
  '/products/:id/images',
  upload.array('images', 4),
  handleUploadError,
  uploadProductImages
);
router.delete('/products/:id/images/:imgId', deleteProductImage);

// packaging units for tiered pricing. the /units/:unitId routes go before /:id
// so express doesn't grab "units" as the :id
router.get('/products/:id/units', getProductUnits);
router.post('/products/:id/units', addProductUnit);
router.put('/products/units/:unitId', updateProductUnit);
router.delete('/products/units/:unitId', deleteProductUnit);

// drivers
router.get('/drivers', getDrivers);
router.patch('/drivers/:id/accept', acceptDriver);
router.patch('/drivers/:id/reject', rejectDriver);
router.delete('/drivers/:id', fireDriver);
router.delete('/drivers/:id/delete', deleteDriver);

// money + market
router.get('/financial', getFinancial);
router.get('/financial/pharmacy-debt/:pharmacy_id', getPharmacyDebt);
router.post('/financial/record-payment', recordPayment);
router.get('/market', getMarket);

module.exports = router;
