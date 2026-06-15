// ============================================================
//  Pharmacy routes  →  mounted at /api/pharmacy
// ============================================================
//  Every route requires a valid JWT (auth) + the 'pharmacy' role.
// ============================================================

const express = require('express');

const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  checkout,
  getOrders,
  getOrderDetail,
  getFinancial,
  createRating,
} = require('../controllers/pharmacy.controller');

const router = express.Router();

// Apply auth + pharmacy role to every route in this router.
router.use(auth, requireRole('pharmacy'));

// Cart
router.get('/cart', getCart);
router.post('/cart', addToCart);
router.patch('/cart/:id', updateCartItem);
router.delete('/cart/:id', removeCartItem);
router.post('/cart/checkout', checkout);

// Orders
router.get('/orders', getOrders);
router.get('/orders/:id', getOrderDetail);

// Financial
router.get('/financial', getFinancial);

// Ratings
router.post('/ratings', createRating);

module.exports = router;
