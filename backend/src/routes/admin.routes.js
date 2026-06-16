// /api/admin - everything here needs a valid JWT + the 'admin' role (except the one GET below)

const express = require('express');

const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const {
  getRegistrations,
  reviewRegistration,
  deleteRegistration,
  createCompany,
  createPharmacy,
  updateCompany,
  updatePharmacy,
  toggleCompanyStatus,
  togglePharmacyStatus,
  deleteCompany,
  deletePharmacy,
  getOrders,
  getAllDrivers,
  getMarket,
  getCategories,
  createCategory,
  deleteCategory,
  getProductTypes,
  addProductType,
  deleteProductType,
  getStats,
  getTopDebtors,
  getTopCompanies,
} = require('../controllers/admin.controller');

const router = express.Router();

// the company Products page reads product types too, so this one GET also allows 'company'.
// has to sit above the router.use() below or the admin-only gate would block companies.
router.get('/product-types', auth, requireRole('admin', 'company'), getProductTypes);

// from here down: admin only
router.use(auth, requireRole('admin'));

// registrations
router.get('/registrations', getRegistrations);
router.patch('/registrations/:id', reviewRegistration);
router.delete('/registrations/:id', deleteRegistration);

// admin creating accounts by hand
router.post('/companies', createCompany);
router.post('/pharmacies', createPharmacy);

// edit the public profile bits (description + address)
router.patch('/companies/:id', updateCompany);
router.patch('/pharmacies/:id', updatePharmacy);

// enable / disable login
router.patch('/companies/:id/toggle-status', toggleCompanyStatus);
router.patch('/pharmacies/:id/toggle-status', togglePharmacyStatus);

// hard delete - controller blocks this if there's order history
router.delete('/companies/:id', deleteCompany);
router.delete('/pharmacies/:id', deletePharmacy);

// dashboard KPI numbers
router.get('/stats', getStats);

// the leaderboards on the reports page
router.get('/top-debtors', getTopDebtors);
router.get('/top-companies', getTopCompanies);

// read-only views into orders / drivers / market
router.get('/orders', getOrders);
router.get('/drivers', getAllDrivers);
router.get('/market', getMarket);

// categories
router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.delete('/categories/:id', deleteCategory);

// product types - the GET is up top so companies can read it, writes stay admin
router.post('/product-types', addProductType);
router.delete('/product-types/:id', deleteProductType);

module.exports = router;
