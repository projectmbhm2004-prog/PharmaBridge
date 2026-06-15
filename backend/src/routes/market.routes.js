// ============================================================
//  Market routes  →  mounted at /api/market
// ============================================================
//  Fully PUBLIC marketplace — no auth middleware at all.
//  NOTE: /products/top5 and /products/offers are registered BEFORE
//  /products/:id so Express does not treat "top5"/"offers" as an :id.
// ============================================================

const express = require('express');

const {
  getProducts,
  getTop5,
  getOffers,
  getProductById,
  getCompanies,
} = require('../controllers/market.controller');

const router = express.Router();

router.get('/products', getProducts);
router.get('/products/top5', getTop5);
router.get('/products/offers', getOffers);
router.get('/products/:id', getProductById);
router.get('/companies', getCompanies);

module.exports = router;
