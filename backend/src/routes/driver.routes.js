// /api/driver - all routes need a valid JWT + the 'driver' role

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

// driver role on everything below
router.use(auth, requireRole('driver'));

router.get('/orders', getOrders);
router.get('/orders/:id', getOrderDetail);
router.patch('/orders/:id/accept', acceptOrder);
router.patch('/orders/:id/reject', rejectOrder);
router.patch('/orders/:id/status', updateStatus);
router.post('/orders/:id/deliver', deliverOrder);

module.exports = router;
