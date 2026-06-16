// /api/market - fully public, no auth at all.
// top5 and offers are registered before /products/:id, otherwise express reads
// "top5"/"offers" as an :id value and hits the wrong handler.

const express = require('express');

const {
  getProducts,
  getTop5,
  getOffers,
  getProductById,
  getCompanies,
  getProductTypes,
} = require('../controllers/market.controller');

const router = express.Router();

router.get('/products', getProducts);
router.get('/products/top5', getTop5);
router.get('/products/offers', getOffers);
router.get('/products/:id', getProductById);
router.get('/companies', getCompanies);
router.get('/product-types', getProductTypes);

module.exports = router;
