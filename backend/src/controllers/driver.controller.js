// ============================================================
//  Driver controller
// ============================================================
//  Assigned orders, accept/reject, strict status progression, and
//  the delivery flow (with item rejections + financial record).
//  All handlers: try/catch -> next(err); multi-table writes use
//  transactions with rollback; socket emits + notifications are
//  non-blocking.
// ============================================================

const pool = require('../config/db');
const { emitToUser } = require('../services/socket.service');
const { AppError } = require('../middleware/errorHandler');

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Load the driver row owned by the given user.
 * @param {number} userId
 * @returns {Promise<object>} driver row
 * @throws {AppError} 404 when the user has no driver profile
 * @throws {AppError} 403 when the driver has been terminated
 */
async function getDriver(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM drivers WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (rows.length === 0) {
    throw new AppError('Driver profile not found', 404);
  }
  const driver = rows[0];
  if (driver.is_fired) {
    throw new AppError('Your account has been terminated', 403);
  }
  return driver;
}

/** Non-fatal socket emit. */
function emitSafe(app, userId, event, data) {
  try {
    emitToUser(app, userId, event, data);
  } catch (err) {
    console.error('[driver] socket emit failed:', err.message);
  }
}

/** Parse a positive integer with a fallback. */
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Resolve the user_id behind a pharmacy id (or null). */
async function getPharmacyUserId(pharmacyId) {
  const [rows] = await pool.query(
    'SELECT user_id FROM pharmacies WHERE id = ? LIMIT 1',
    [pharmacyId]
  );
  return rows.length ? rows[0].user_id : null;
}

/** Resolve the user_id behind a company id (or null). */
async function getCompanyUserId(companyId) {
  const [rows] = await pool.query(
    'SELECT user_id FROM companies WHERE id = ? LIMIT 1',
    [companyId]
  );
  return rows.length ? rows[0].user_id : null;
}

// ============================================================
//  ORDERS
// ============================================================

// GET /api/driver/orders
async function getOrders(req, res, next) {
  try {
    const driver = await getDriver(req.user.userId);
    const { status } = req.query;
    const page = toInt(req.query.page, 1);
    const limit = toInt(req.query.limit, 20);
    const offset = (page - 1) * limit;

    const conditions = ['o.driver_id = ?'];
    const params = [driver.id];

    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o ${where}`,
      params
    );
    const total = countRows[0].total;

    const [orders] = await pool.query(
      `SELECT o.*,
              ph.name AS pharmacy_name,
              ph.address AS pharmacy_address,
              ph.phone AS pharmacy_phone,
              c.name AS company_name
         FROM orders o
         JOIN pharmacies ph ON ph.id = o.pharmacy_id
         JOIN companies c ON c.id = o.company_id
         ${where}
        ORDER BY o.updated_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: { orders, total, page, limit },
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/driver/orders/:id
async function getOrderDetail(req, res, next) {
  try {
    const driver = await getDriver(req.user.userId);
    const { id } = req.params;

    const [orders] = await pool.query(
      `SELECT o.*,
              ph.name AS pharmacy_name,
              ph.address AS pharmacy_address,
              ph.phone AS pharmacy_phone,
              c.name AS company_name
         FROM orders o
         JOIN pharmacies ph ON ph.id = o.pharmacy_id
         JOIN companies c ON c.id = o.company_id
        WHERE o.id = ? AND o.driver_id = ? LIMIT 1`,
      [id, driver.id]
    );
    if (orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }
    const order = orders[0];

    const [items] = await pool.query(
      `SELECT oi.*,
              p.name AS product_name,
              (SELECT image_url FROM product_images
                WHERE product_id = p.id AND sort_order = 0 LIMIT 1) AS main_image
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ?`,
      [id]
    );

    // Outstanding debt for this pharmacy <-> company, excluding this order
    // (shown to the driver at payment time, for information only).
    const [debtRows] = await pool.query(
      `SELECT COALESCE(SUM(debt_amount), 0) AS previous_debt
         FROM financial_records
        WHERE pharmacy_id = ? AND company_id = ? AND order_id != ?`,
      [order.pharmacy_id, order.company_id, id]
    );

    return res.json({
      success: true,
      data: {
        ...order,
        items,
        previous_debt: Number(debtRows[0].previous_debt) || 0,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/driver/orders/:id/accept
async function acceptOrder(req, res, next) {
  try {
    const driver = await getDriver(req.user.userId);
    const { id } = req.params;

    const [orders] = await pool.query(
      `SELECT * FROM orders
        WHERE id = ? AND driver_id = ? AND status = 'accepted' LIMIT 1`,
      [id, driver.id]
    );
    if (orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    await pool.query(
      `INSERT INTO order_status_log (order_id, status, changed_by, note)
       VALUES (?, 'accepted', ?, 'Driver acknowledged assignment')`,
      [id, req.user.userId]
    );

    return res.json({ success: true, message: 'Order accepted.' });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/driver/orders/:id/reject
async function rejectOrder(req, res, next) {
  let conn;
  try {
    const driver = await getDriver(req.user.userId);
    const { id } = req.params;
    const { rejection_reason } = req.body || {};

    if (!rejection_reason || String(rejection_reason).trim() === '') {
      return res
        .status(400)
        .json({ success: false, message: 'Rejection reason is required' });
    }

    const [orders] = await pool.query(
      `SELECT * FROM orders
        WHERE id = ? AND driver_id = ? AND status = 'accepted' LIMIT 1`,
      [id, driver.id]
    );
    if (orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }
    const order = orders[0];

    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query(
      "UPDATE orders SET driver_id = NULL, status = 'pending' WHERE id = ?",
      [id]
    );

    // The accept trigger (trg_update_product_total_orders) bumped total_orders
    // by quantity_ordered when this order was accepted. Now that it is going
    // back to 'pending', undo that bump so a later re-accept doesn't double-count
    // total_orders.
    // Stock is intentionally NOT restored here: under the current model stock is
    // reserved at CHECKOUT (order creation), not at accept. A driver rejection
    // returns the order to 'pending' — it stays live and will be re-accepted, so
    // the checkout reservation must stand. (Stock is only restored when an order
    // moves to a terminal rejected/cancelled state.)
    const [restoreItems] = await conn.query(
      'SELECT product_id, quantity_ordered FROM order_items WHERE order_id = ?',
      [id]
    );
    for (const item of restoreItems) {
      await conn.query(
        `UPDATE products
            SET total_orders = GREATEST(0, total_orders - ?)
          WHERE id = ? AND company_id = ?`,
        [item.quantity_ordered, item.product_id, order.company_id]
      );
    }

    await conn.query(
      `INSERT INTO order_status_log (order_id, status, changed_by, note)
       VALUES (?, 'accepted', ?, ?)`,
      [id, req.user.userId, `Driver rejected: ${rejection_reason}`]
    );

    await conn.commit();
    conn.release();
    conn = null;

    // notify the company (non-blocking)
    const companyUserId = await getCompanyUserId(order.company_id);
    try {
      if (companyUserId) {
        emitSafe(req.app, companyUserId, 'driver_rejected_order', {
          order_id: Number(id),
          reason: rejection_reason,
        });
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, related_order_id)
           VALUES (?, 'driver_rejected_order', ?, ?, ?)`,
          [
            companyUserId,
            'Driver rejected assignment',
            `A driver rejected order #${id}. Reason: ${rejection_reason}`,
            id,
          ]
        );
      }
    } catch (notifyErr) {
      console.error('[driver] reject notification failed:', notifyErr.message);
    }

    return res.json({
      success: true,
      message: 'Order rejected and returned to pending.',
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[driver] rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// PATCH /api/driver/orders/:id/status
async function updateStatus(req, res, next) {
  let conn;
  try {
    const driver = await getDriver(req.user.userId);
    const { id } = req.params;
    const { status } = req.body || {};

    // status -> the order status it requires to already be in
    const progression = {
      picked_up: 'accepted',
      on_the_way: 'picked_up',
      arrived: 'on_the_way',
    };

    if (!status || !Object.prototype.hasOwnProperty.call(progression, status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: picked_up, on_the_way, arrived',
      });
    }

    const requiredCurrent = progression[status];

    const [orders] = await pool.query(
      `SELECT * FROM orders
        WHERE id = ? AND driver_id = ? AND status = ? LIMIT 1`,
      [id, driver.id, requiredCurrent]
    );
    if (orders.length === 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot update status. Order must be ${requiredCurrent} first.`,
      });
    }
    const order = orders[0];

    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    await conn.query(
      `INSERT INTO order_status_log (order_id, status, changed_by)
       VALUES (?, ?, ?)`,
      [id, status, req.user.userId]
    );

    await conn.commit();
    conn.release();
    conn = null;

    // notify pharmacy + company (non-blocking)
    const pharmacyUserId = await getPharmacyUserId(order.pharmacy_id);
    const companyUserId = await getCompanyUserId(order.company_id);
    try {
      const payload = { order_id: Number(id), status };
      const recipients = [pharmacyUserId, companyUserId].filter(Boolean);
      for (const userId of recipients) {
        emitSafe(req.app, userId, 'order_status_updated', payload);
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, related_order_id)
           VALUES (?, 'order_status_updated', ?, ?, ?)`,
          [
            userId,
            'Order status updated',
            `Order #${id} status updated to ${status}.`,
            id,
          ]
        );
      }
    } catch (notifyErr) {
      console.error('[driver] status notification failed:', notifyErr.message);
    }

    return res.json({ success: true, message: `Status updated to ${status}.` });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[driver] rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// POST /api/driver/orders/:id/deliver
async function deliverOrder(req, res, next) {
  let conn;
  try {
    const driver = await getDriver(req.user.userId);
    const { id } = req.params;
    const { paid_amount } = req.body || {};
    const rejectedItems = Array.isArray(req.body && req.body.rejected_items)
      ? req.body.rejected_items
      : [];

    // paid_amount required and >= 0
    const paidAmount = Number(paid_amount);
    if (paid_amount === undefined || paid_amount === null || Number.isNaN(paidAmount) || paidAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'paid_amount is required and must be 0 or greater',
      });
    }

    // each rejected item with quantity_rejected > 0 must carry a reason
    for (const item of rejectedItems) {
      const qty = Number(item && item.quantity_rejected);
      if (qty > 0 && (!item.rejection_reason || String(item.rejection_reason).trim() === '')) {
        return res.status(400).json({
          success: false,
          message: 'rejection_reason is required for each rejected item',
        });
      }
    }

    const [orders] = await pool.query(
      `SELECT * FROM orders
        WHERE id = ? AND driver_id = ? AND status = 'arrived' LIMIT 1`,
      [id, driver.id]
    );
    if (orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }
    const order = orders[0];

    const [orderItems] = await pool.query(
      `SELECT oi.*, COALESCE(pu.units_count, 1) AS units_count
         FROM order_items oi
         LEFT JOIN product_units pu ON pu.id = oi.product_unit_id
        WHERE oi.order_id = ?`,
      [id]
    );
    const itemsById = new Map(orderItems.map((it) => [Number(it.id), it]));

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Serialize all settlement for this pharmacy. Two simultaneous deliveries to
    // the same pharmacy would otherwise each read the same `prevDebt` (step d)
    // and both absorb it, pushing v_pharmacy_debts.total_debt negative. Locking
    // the pharmacy row holds the second transaction until the first commits, so
    // its prevDebt read is fresh. (recordPayment takes the same lock.)
    await conn.query('SELECT id FROM pharmacies WHERE id = ? FOR UPDATE', [
      order.pharmacy_id,
    ]);

    // a. apply item rejections + accumulate deduction
    let deduction = 0;
    const appliedRejections = rejectedItems.filter(
      (item) => Number(item && item.quantity_rejected) > 0
    );

    for (const item of appliedRejections) {
      const orderItem = itemsById.get(Number(item.order_item_id));
      if (!orderItem) {
        await conn.rollback();
        conn.release();
        conn = null;
        return res.status(400).json({
          success: false,
          message: `Invalid order_item_id: ${item.order_item_id}`,
        });
      }

      const qtyRejected = Number(item.quantity_rejected);
      if (qtyRejected > orderItem.quantity_ordered) {
        await conn.rollback();
        conn.release();
        conn = null;
        return res.status(400).json({
          success: false,
          message: `quantity_rejected exceeds quantity_ordered for item ${item.order_item_id}`,
        });
      }

      await conn.query(
        'UPDATE order_items SET quantity_rejected = ?, rejection_reason = ? WHERE id = ?',
        [qtyRejected, item.rejection_reason, orderItem.id]
      );

      // Return the rejected packages to stock. quantity_rejected counts
      // PACKAGES; stock is held in BASE units, so restore qtyRejected *
      // units_count — consistent with the base-unit reservation made at checkout.
      const baseUnitsRejected = qtyRejected * (Number(orderItem.units_count) || 1);
      await conn.query(
        `UPDATE products SET quantity_in_stock = quantity_in_stock + ?
          WHERE id = ? AND company_id = ?`,
        [baseUnitsRejected, orderItem.product_id, order.company_id]
      );

      deduction += qtyRejected * Number(orderItem.unit_price);
    }

    // b. new total after deductions (never negative)
    const newTotal = Math.max(0, Number(order.total_amount) - deduction);

    // c. final status depends on whether anything was rejected
    const finalStatus = appliedRejections.length > 0 ? 'partially_delivered' : 'delivered';

    // d. previous outstanding debt for this pharmacy <-> company (excluding this order)
    const [debtRows] = await conn.query(
      `SELECT COALESCE(SUM(debt_amount), 0) AS prev_debt
         FROM financial_records
        WHERE pharmacy_id = ? AND company_id = ? AND order_id != ?`,
      [order.pharmacy_id, order.company_id, id]
    );
    const prevDebt = Number(debtRows[0].prev_debt) || 0;

    // e. cap the collected amount at what is actually owed (this order plus any
    // outstanding previous debt). Over-payment does NOT block the delivery, but
    // the collected amount is capped at totalDue. financial_records.debt_amount
    // is a STORED generated column = (order_total - paid_amount); without this
    // cap an over-payment would persist a negative debt and corrupt the running
    // balance summed by v_pharmacy_debts.
    const totalDue = newTotal + prevDebt;
    // When totalDue <= 0 the pharmacy already has a credit balance (overpaid
    // previously), so nothing is collectible — force the collected amount to 0
    // rather than letting Math.min pick a negative totalDue.
    const cappedPaid = totalDue <= 0 ? 0 : Math.min(paidAmount, totalDue);

    // f. update the order
    await conn.query(
      'UPDATE orders SET status = ?, total_amount = ?, paid_amount = ? WHERE id = ?',
      [finalStatus, newTotal, cappedPaid, id]
    );

    // g. financial record (idempotent on order_id)
    await conn.query(
      `INSERT INTO financial_records
         (order_id, pharmacy_id, company_id, order_total, paid_amount, previous_debt, collected_at, driver_id)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         order_total = VALUES(order_total),
         paid_amount = VALUES(paid_amount),
         previous_debt = VALUES(previous_debt),
         collected_at = NOW(),
         driver_id = VALUES(driver_id)`,
      [id, order.pharmacy_id, order.company_id, newTotal, cappedPaid, prevDebt, driver.id]
    );

    // h. log final status
    await conn.query(
      `INSERT INTO order_status_log (order_id, status, changed_by)
       VALUES (?, ?, ?)`,
      [id, finalStatus, req.user.userId]
    );

    await conn.commit();
    conn.release();
    conn = null;

    // notifications (non-blocking)
    const pharmacyUserId = await getPharmacyUserId(order.pharmacy_id);
    const companyUserId = await getCompanyUserId(order.company_id);
    try {
      if (pharmacyUserId) {
        emitSafe(req.app, pharmacyUserId, 'order_delivered', {
          order_id: Number(id),
          status: finalStatus,
          enable_rating: true,
        });
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, related_order_id)
           VALUES (?, 'order_delivered', ?, ?, ?)`,
          [
            pharmacyUserId,
            'Order delivered',
            `Order #${id} has been ${finalStatus.replace('_', ' ')}.`,
            id,
          ]
        );
      }
      if (companyUserId) {
        emitSafe(req.app, companyUserId, 'order_delivered', {
          order_id: Number(id),
          status: finalStatus,
        });
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, related_order_id)
           VALUES (?, 'order_delivered', ?, ?, ?)`,
          [
            companyUserId,
            'Order delivered',
            `Order #${id} has been ${finalStatus.replace('_', ' ')}.`,
            id,
          ]
        );
      }
    } catch (notifyErr) {
      console.error('[driver] deliver notification failed:', notifyErr.message);
    }

    return res.json({ success: true, message: 'Delivery confirmed.' });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[driver] rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

module.exports = {
  getOrders,
  getOrderDetail,
  acceptOrder,
  rejectOrder,
  updateStatus,
  deliverOrder,
};
