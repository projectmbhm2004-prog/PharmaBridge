// /api/pharmacy - all routes need a valid JWT + the 'pharmacy' role

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

// pharmacy role on everything below
router.use(auth, requireRole('pharmacy'));

// cart
router.get('/cart', getCart);
router.post('/cart', addToCart);
router.patch('/cart/:id', updateCartItem);
router.delete('/cart/:id', removeCartItem);
router.post('/cart/checkout', checkout);

// orders
router.get('/orders', getOrders);
router.get('/orders/:id', getOrderDetail);

// money
router.get('/financial', getFinancial);

// ratings
router.post('/ratings', createRating);

module.exports = router;
