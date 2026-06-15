// ============================================================
//  Admin routes  →  mounted at /api/admin
// ============================================================
//  Every route requires a valid JWT (auth) + the 'admin' role.
// ============================================================

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

// Product types are read by the company Products page too, so the listing
// route allows the 'company' role (write routes stay admin-only below).
router.get('/product-types', auth, requireRole('admin', 'company'), getProductTypes);

// Apply auth + admin role to every route in this router.
router.use(auth, requireRole('admin'));

// Registrations
router.get('/registrations', getRegistrations);
router.patch('/registrations/:id', reviewRegistration);
router.delete('/registrations/:id', deleteRegistration);

// Manual account creation
router.post('/companies', createCompany);
router.post('/pharmacies', createPharmacy);

// Edit public profile fields (description + address)
router.patch('/companies/:id', updateCompany);
router.patch('/pharmacies/:id', updatePharmacy);

// Account status (enable / disable login)
router.patch('/companies/:id/toggle-status', toggleCompanyStatus);
router.patch('/pharmacies/:id/toggle-status', togglePharmacyStatus);

// Permanent deletion (blocked when the account has order history)
router.delete('/companies/:id', deleteCompany);
router.delete('/pharmacies/:id', deletePharmacy);

// Platform stats (dashboard KPIs)
router.get('/stats', getStats);

// Financial leaderboards (reports page)
router.get('/top-debtors', getTopDebtors);
router.get('/top-companies', getTopCompanies);

// Orders & marketplace (view only)
router.get('/orders', getOrders);
router.get('/drivers', getAllDrivers);
router.get('/market', getMarket);

// Categories
router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.delete('/categories/:id', deleteCategory);

// Product types (GET registered above so the company role can read it)
router.post('/product-types', addProductType);
router.delete('/product-types/:id', deleteProductType);

module.exports = router;
