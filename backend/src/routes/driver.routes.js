// ============================================================
//  Driver routes  →  mounted at /api/driver
// ============================================================
//  Every route requires a valid JWT (auth) + the 'driver' role.
// ============================================================

const express = require('express');

const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const {
  getOrders,
  getOrderDetail,
  acceptOrder,
  rejectOrder,
  updateStatus,
  deliverOrder,
} = require('../controllers/driver.controller');

const router = express.Router();

// Apply auth + driver role to every route in this router.
router.use(auth, requireRole('driver'));

router.get('/orders', getOrders);
router.get('/orders/:id', getOrderDetail);
router.patch('/orders/:id/accept', acceptOrder);
router.patch('/orders/:id/reject', rejectOrder);
router.patch('/orders/:id/status', updateStatus);
router.post('/orders/:id/deliver', deliverOrder);

module.exports = router;
