// company controller - incoming orders (accept/reject + assign a driver), product CRUD with
// Cloudinary images, driver management, the financial view, and the market view. multi-table
// writes use transactions, Cloudinary/email/socket are all best-effort.

const pool = require('../config/db');
const cloudinary = require('../config/cloudinary');
const { sendEmail } = require('../services/email.service');
const { emitToUser } = require('../services/socket.service');
const { AppError } = require('../middleware/errorHandler');
const { unitEffectivePrice } = require('../utils/pricing');

// grab the company row for this user, 404 if there's no company profile
async function getCompany(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM companies WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (rows.length === 0) {
    throw new AppError('Company profile not found', 404);
  }
  return rows[0];
}

// send and forget - swallow errors so a flaky mail server can't fail the request
function sendEmailSafe(opts) {
  sendEmail(opts).catch((err) =>
    console.error('[company] email failed:', err.message)
  );
}

// wrap emit so a socket hiccup never breaks the request
function emitSafe(app, userId, event, data) {
  try {
    emitToUser(app, userId, event, data);
  } catch (err) {
    console.error('[company] socket emit failed:', err.message);
  }
}

// an offer_ends_at, when set, has to be strictly in the future - a past/today date makes the
// offer invisible the moment it's saved. accepts a date or datetime string and returns true only
// if it parses and lands after now.
function isFutureDate(value) {
  const ts = Date.parse(value);
  return !Number.isNaN(ts) && ts > Date.now();
}

// positive int or fallback, for page/limit
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// whitelist of sort options -> ORDER BY. never interpolate user input into the clause.
const SORT_MAP = {
  newest: 'p.created_at DESC',
  oldest: 'p.created_at ASC',
  price_asc: 'p.price ASC',
  price_desc: 'p.price DESC',
  popular: 'p.total_orders DESC',
};

// tell a pharmacy its order got rejected. shared by rejectOrder (the up-front reject) and
// acceptOrder's "everything got rejected" path so both send the exact same notification + event.
// best-effort, never throws back into the request.
async function notifyPharmacyRejected(app, pharmacyId, orderId, reason) {
  try {
    const [phRows] = await pool.query(
      'SELECT user_id FROM pharmacies WHERE id = ? LIMIT 1',
      [pharmacyId]
    );
    const pharmacyUserId = phRows.length ? phRows[0].user_id : null;
    if (pharmacyUserId) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, related_order_id)
         VALUES (?, 'order_rejected', ?, ?, ?)`,
        [
          pharmacyUserId,
          'Order rejected',
          reason
            ? `Your order was rejected. Reason: ${reason}`
            : 'Your order was rejected.',
          orderId,
        ]
      );
      emitSafe(app, pharmacyUserId, 'order_rejected', {
        order_id: Number(orderId),
        reason: reason || null,
      });
    }
  } catch (notifyErr) {
    console.error('[company] reject notification failed:', notifyErr.message);
  }
}

// JSON_ARRAYAGG on a LEFT JOIN with no matches gives you a [{id:null,...}] row, so parse the
// aggregate and drop any null-id junk rows
function parseAgg(value) {
  if (!value) return [];
  let arr;
  if (typeof value === 'string') {
    try {
      arr = JSON.parse(value);
    } catch (e) {
      return [];
    }
  } else {
    arr = value; // mysql2 sometimes hands us an already-parsed array
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter((item) => item && item.id !== null && item.id !== undefined);
}

// validate + clean up an incoming packaging units array. returns { units } on success or
// { error } with a user-facing message. exactly one row ends up is_default - the smallest
// packaging if the caller didn't flag one.
function normalizeUnits(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return { error: 'At least one packaging unit is required' };
  }

  const seen = new Set();
  const rows = [];
  for (const raw of input) {
    const unitName = String(raw?.unit_name ?? '').trim();
    if (!unitName) return { error: 'Each packaging unit needs a name' };
    const key = unitName.toLowerCase();
    if (seen.has(key)) {
      return { error: `Duplicate packaging unit name: "${unitName}"` };
    }
    seen.add(key);

    const unitsCount = Number(raw?.units_count);
    if (!Number.isInteger(unitsCount) || unitsCount < 1) {
      return { error: `"${unitName}": units count must be a whole number ≥ 1` };
    }

    const discount = raw?.discount_percent === '' || raw?.discount_percent == null
      ? 0
      : Number(raw.discount_percent);
    if (Number.isNaN(discount) || discount < 0 || discount > 100) {
      return { error: `"${unitName}": discount must be between 0 and 100` };
    }

    let finalPrice = null;
    if (raw?.final_price !== '' && raw?.final_price != null) {
      finalPrice = Number(raw.final_price);
      if (Number.isNaN(finalPrice) || finalPrice <= 0) {
        return { error: `"${unitName}": price override must be greater than 0` };
      }
    }

    rows.push({
      unit_name: unitName,
      units_count: unitsCount,
      discount_percent: discount,
      final_price: finalPrice,
      is_default: raw?.is_default === true || raw?.is_default === 1,
    });
  }

  // pick the default: first one they explicitly marked, otherwise the smallest pack
  let defaultIdx = rows.findIndex((r) => r.is_default);
  if (defaultIdx === -1) {
    defaultIdx = rows.reduce(
      (min, r, i) => (r.units_count < rows[min].units_count ? i : min),
      0
    );
  }
  rows.forEach((r, i) => {
    r.is_default = i === defaultIdx;
  });

  return { units: rows };
}

// GET /api/company/orders
async function getOrders(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);
    const { status, pharmacy_id, from, to, search } = req.query;
    const page = toInt(req.query.page, 1);
    const limit = toInt(req.query.limit, 20);
    const offset = (page - 1) * limit;

    const conditions = ['o.company_id = ?'];
    const params = [company.id];

    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }
    if (pharmacy_id) {
      conditions.push('o.pharmacy_id = ?');
      params.push(pharmacy_id);
    }
    if (from) {
      conditions.push('o.created_at >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('o.created_at <= ?');
      params.push(to);
    }
    // search box hits either the order id or the pharmacy name
    if (search) {
      conditions.push('(CAST(o.id AS CHAR) LIKE ? OR ph.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // count for paging - joins pharmacies so the name search resolves, same as the listing query
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM orders o
         JOIN pharmacies ph ON ph.id = o.pharmacy_id
        ${where}`,
      params
    );
    const total = countRows[0].total;

    const [orders] = await pool.query(
      `SELECT o.*,
              ph.name AS pharmacy_name,
              ph.phone AS pharmacy_phone,
              ph.address AS pharmacy_address,
              d.full_name AS driver_name,
              d.phone AS driver_phone,
              JSON_ARRAYAGG(
                JSON_OBJECT(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'product_name', p.name,
                  'unit_name', pu.unit_name,
                  'units_count', pu.units_count,
                  'quantity_ordered', oi.quantity_ordered,
                  'quantity_rejected', oi.quantity_rejected,
                  'unit_price', oi.unit_price,
                  'rejection_reason', oi.rejection_reason,
                  'main_image', (SELECT image_url FROM product_images
                                  WHERE product_id = oi.product_id AND sort_order = 0 LIMIT 1)
                )
              ) AS items
         FROM orders o
         JOIN pharmacies ph ON ph.id = o.pharmacy_id
         LEFT JOIN drivers d ON d.id = o.driver_id
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN product_units pu ON pu.id = oi.product_unit_id
         ${where}
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    for (const order of orders) {
      order.items = parseAgg(order.items);

      const [statusLog] = await pool.query(
        `SELECT * FROM order_status_log
          WHERE order_id = ?
          ORDER BY changed_at ASC`,
        [order.id]
      );
      order.status_log = statusLog;
    }

    return res.json({
      success: true,
      data: { orders, total, page, limit },
    });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/company/orders/:id/accept
// accept a pending order and assign a driver. can optionally take an item_rejections array
// ([{ order_item_id, quantity_rejected, rejection_reason }]) so the company can reject part or
// all of an item right at accept time. no rejections = plain full accept like before. for each
// rejected chunk we save quantity_rejected + reason and put those base units back in stock (same
// move as driver.deliverOrder), then recompute total_amount over only the accepted quantities.
// if literally everything gets rejected, the order goes to 'rejected' with no driver and follows
// the same notification path as a normal reject.
async function acceptOrder(req, res, next) {
  let conn;
  try {
    const company = await getCompany(req.user.userId);
    const { id } = req.params;
    const { driver_id } = req.body || {};
    const itemRejections = Array.isArray(req.body && req.body.item_rejections)
      ? req.body.item_rejections
      : [];

    // order must belong to company and still be pending
    const [orders] = await pool.query(
      `SELECT * FROM orders
        WHERE id = ? AND company_id = ? AND status = 'pending' LIMIT 1`,
      [id, company.id]
    );
    if (orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }
    const order = orders[0];

    // pull the line items (with units_count + unit_price) - we need them to validate the
    // rejections, recompute the total, and work out whether the whole order got rejected
    const [orderItems] = await pool.query(
      `SELECT oi.id, oi.product_id, oi.quantity_ordered, oi.unit_price,
              COALESCE(pu.units_count, 1) AS units_count
         FROM order_items oi
         LEFT JOIN product_units pu ON pu.id = oi.product_unit_id
        WHERE oi.order_id = ?`,
      [id]
    );
    const itemsById = new Map(orderItems.map((it) => [Number(it.id), it]));

    // validate each rejection into a per-item map. quantity_rejected has to be a whole number
    // between 0 and what was ordered. if an item shows up twice, the last entry wins.
    const rejByItem = new Map();
    for (const r of itemRejections) {
      const oiId = Number(r && r.order_item_id);
      const orderItem = itemsById.get(oiId);
      if (!orderItem) {
        return res.status(400).json({
          success: false,
          message: `Invalid order_item_id: ${r && r.order_item_id}`,
        });
      }
      const qtyRejected = Number(r && r.quantity_rejected);
      if (!Number.isInteger(qtyRejected) || qtyRejected < 0) {
        return res.status(400).json({
          success: false,
          message: `quantity_rejected must be a whole number ≥ 0 for item ${oiId}`,
        });
      }
      if (qtyRejected > orderItem.quantity_ordered) {
        return res.status(400).json({
          success: false,
          message: `quantity_rejected exceeds quantity_ordered for item ${oiId}`,
        });
      }
      rejByItem.set(oiId, {
        qtyRejected,
        reason:
          r.rejection_reason && String(r.rejection_reason).trim() !== ''
            ? String(r.rejection_reason).trim()
            : null,
      });
    }

    const appliedRejections = [...rejByItem.entries()].filter(
      ([, v]) => v.qtyRejected > 0
    );

    // "fully rejected" = every single line had its whole quantity knocked back
    const fullyRejected =
      orderItems.length > 0 &&
      orderItems.every((it) => {
        const v = rejByItem.get(Number(it.id));
        return v && v.qtyRejected === it.quantity_ordered;
      });

    // need a driver for a real accept (full or partial), but not if we're rejecting the whole thing
    let driver = null;
    if (!fullyRejected) {
      if (!driver_id) {
        return res
          .status(400)
          .json({ success: false, message: 'driver_id is required' });
      }
      const [drivers] = await pool.query(
        `SELECT * FROM drivers
          WHERE id = ? AND company_id = ?
            AND registration_status = 'accepted' AND is_fired = FALSE LIMIT 1`,
        [driver_id, company.id]
      );
      if (drivers.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: 'Driver not found or not active' });
      }
      driver = drivers[0];
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // for each rejection: save quantity_rejected + reason and give the packages back to stock.
    // quantity_rejected is PACKAGES, stock is BASE units, so add back qtyRejected * units_count -
    // same conversion checkout and the driver-side restore use. lock the product row first so a
    // concurrent checkout doesn't read a half-updated number.
    for (const [oiId, v] of appliedRejections) {
      const orderItem = itemsById.get(oiId);
      await conn.query(
        'UPDATE order_items SET quantity_rejected = ?, rejection_reason = ? WHERE id = ?',
        [v.qtyRejected, v.reason, oiId]
      );
      const baseUnitsRejected = v.qtyRejected * (Number(orderItem.units_count) || 1);
      await conn.query(
        'SELECT quantity_in_stock FROM products WHERE id = ? FOR UPDATE',
        [orderItem.product_id]
      );
      await conn.query(
        `UPDATE products SET quantity_in_stock = quantity_in_stock + ?
          WHERE id = ? AND company_id = ?`,
        [baseUnitsRejected, orderItem.product_id, company.id]
      );
    }

    // total is only the accepted quantities, rejected stuff doesn't get billed
    let newTotal = 0;
    for (const it of orderItems) {
      const v = rejByItem.get(Number(it.id));
      const qtyRej = v ? v.qtyRejected : 0;
      newTotal += (it.quantity_ordered - qtyRej) * Number(it.unit_price);
    }

    // heads up: we do NOT take stock for the accepted portion here - that already came off at
    // checkout. accepting just moves the status forward and assigns a driver. only rejected units
    // (and full rejects / cancellations) ever go back to the pool.
    if (fullyRejected) {
      // same as rejectOrder: status='rejected', no driver, no status_log row (the log ENUM has
      // no 'rejected' value). everything was 100% rejected so the stock is already fully back above.
      await conn.query(
        "UPDATE orders SET status = 'rejected', total_amount = ? WHERE id = ?",
        [newTotal, id]
      );
    } else {
      await conn.query(
        "UPDATE orders SET status = 'accepted', driver_id = ?, total_amount = ? WHERE id = ?",
        [driver_id, newTotal, id]
      );
      await conn.query(
        `INSERT INTO order_status_log (order_id, status, changed_by)
         VALUES (?, 'accepted', ?)`,
        [id, req.user.userId]
      );
    }

    await conn.commit();
    conn.release();
    conn = null;

    // full reject sends the same pharmacy notification as a plain reject, then we're done
    if (fullyRejected) {
      await notifyPharmacyRejected(req.app, order.pharmacy_id, id, null);
      return res.json({
        success: true,
        message: 'All items were rejected; the order has been rejected.',
      });
    }

    // pharmacy's user id, for the accept notifications below
    const [phRows] = await pool.query(
      'SELECT user_id FROM pharmacies WHERE id = ? LIMIT 1',
      [order.pharmacy_id]
    );
    const pharmacyUserId = phRows.length ? phRows[0].user_id : null;

    // notify the pharmacy and the assigned driver, best-effort
    try {
      if (pharmacyUserId) {
        const accBody = appliedRejections.length
          ? 'Your order has been accepted with some items rejected'
          : 'Your order has been accepted';
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, related_order_id)
           VALUES (?, 'order_accepted', ?, ?, ?)`,
          [pharmacyUserId, 'Order accepted', accBody, id]
        );
        emitSafe(req.app, pharmacyUserId, 'order_accepted', {
          order_id: Number(id),
          message: accBody,
        });
      }
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, related_order_id)
         VALUES (?, 'driver_assigned', ?, ?, ?)`,
        [driver.user_id, 'New delivery assigned', 'You have been assigned to a new order', id]
      );
      emitSafe(req.app, driver.user_id, 'driver_assigned', {
        order_id: Number(id),
        message: 'You have been assigned to a new order',
      });
    } catch (notifyErr) {
      console.error('[company] accept notifications failed:', notifyErr.message);
    }

    return res.json({
      success: true,
      message: appliedRejections.length
        ? 'Order accepted with item rejections and driver assigned.'
        : 'Order accepted and driver assigned.',
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[company] rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// PATCH /api/company/orders/:id/reject
async function rejectOrder(req, res, next) {
  let conn;
  try {
    const company = await getCompany(req.user.userId);
    const { id } = req.params;
    const { rejection_reason } = req.body || {};

    const [orders] = await pool.query(
      `SELECT * FROM orders
        WHERE id = ? AND company_id = ? AND status = 'pending' LIMIT 1`,
      [id, company.id]
    );
    if (orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }
    const order = orders[0];

    // reject and put stock back in one transaction. it was reserved at checkout, so rejecting a
    // still-pending order has to return those base units. quantity_ordered is PACKAGES, stock is
    // BASE units, so add back quantity_ordered * units_count per line. lock each product row first.
    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query(
      "UPDATE orders SET status = 'rejected', rejection_reason = ? WHERE id = ?",
      [rejection_reason || null, id]
    );

    const [rejectedItems] = await conn.query(
      `SELECT oi.product_id, oi.quantity_ordered,
              COALESCE(pu.units_count, 1) AS units_count
         FROM order_items oi
         LEFT JOIN product_units pu ON pu.id = oi.product_unit_id
        WHERE oi.order_id = ?`,
      [id]
    );
    for (const item of rejectedItems) {
      const baseUnits = item.quantity_ordered * (Number(item.units_count) || 1);
      await conn.query(
        'SELECT quantity_in_stock FROM products WHERE id = ? FOR UPDATE',
        [item.product_id]
      );
      await conn.query(
        `UPDATE products SET quantity_in_stock = quantity_in_stock + ?
          WHERE id = ? AND company_id = ?`,
        [baseUnits, item.product_id, company.id]
      );
    }

    await conn.commit();
    conn.release();
    conn = null;

    await notifyPharmacyRejected(req.app, order.pharmacy_id, id, rejection_reason || null);

    return res.json({ success: true, message: 'Order rejected.' });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[company] reject rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// PATCH /api/company/orders/:id/reassign
// hand an in-flight order to a different active driver. handy when the original driver got fired
// or deactivated mid-delivery (their account can't move it anymore), or just to swap who's doing
// it. only works while the order is actually in progress - not for pending/delivered/rejected.
// the status stays put, we only change driver_id.
async function reassignDriver(req, res, next) {
  let conn;
  try {
    const company = await getCompany(req.user.userId);
    const { id } = req.params;
    const { driver_id } = req.body || {};

    if (!driver_id) {
      return res
        .status(400)
        .json({ success: false, message: 'driver_id is required' });
    }

    const IN_PROGRESS = ['accepted', 'picked_up', 'on_the_way', 'arrived'];

    // has to be this company's order
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE id = ? AND company_id = ? LIMIT 1',
      [id, company.id]
    );
    if (orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }
    const order = orders[0];

    // and it has to be mid-flight
    if (!IN_PROGRESS.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message:
          'Only in-progress orders (accepted, picked up, on the way, arrived) can be reassigned.',
      });
    }

    // the new driver has to be ours, accepted, and not fired
    const [drivers] = await pool.query(
      `SELECT * FROM drivers
        WHERE id = ? AND company_id = ?
          AND registration_status = 'accepted' AND is_fired = FALSE LIMIT 1`,
      [driver_id, company.id]
    );
    if (drivers.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Driver not found or not active' });
    }
    const newDriver = drivers[0];

    if (order.driver_id !== null && Number(order.driver_id) === Number(driver_id)) {
      return res.status(400).json({
        success: false,
        message: 'Order is already assigned to this driver.',
      });
    }

    const oldDriverId = order.driver_id;

    // swap the driver and log it. the order keeps its current status (which is a valid log ENUM
    // value), so we just re-log that status with a note saying it was reassigned.
    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query('UPDATE orders SET driver_id = ? WHERE id = ?', [
      driver_id,
      id,
    ]);
    await conn.query(
      `INSERT INTO order_status_log (order_id, status, changed_by, note)
       VALUES (?, ?, ?, ?)`,
      [id, order.status, req.user.userId, `Reassigned to driver ${newDriver.full_name}`]
    );

    await conn.commit();
    conn.release();
    conn = null;

    // ping the new driver (so it shows up for them) and the old one (so they know it left). best-effort.
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, related_order_id)
         VALUES (?, 'driver_assigned', ?, ?, ?)`,
        [newDriver.user_id, 'New delivery assigned', `You have been assigned to order #${id}`, id]
      );
      emitSafe(req.app, newDriver.user_id, 'order_received', {
        order_id: Number(id),
        message: 'You have been assigned to a new order',
      });

      if (oldDriverId !== null && Number(oldDriverId) !== Number(driver_id)) {
        const [oldRows] = await pool.query(
          'SELECT user_id FROM drivers WHERE id = ? LIMIT 1',
          [oldDriverId]
        );
        if (oldRows.length) {
          const oldDriverUserId = oldRows[0].user_id;
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, body, related_order_id)
             VALUES (?, 'order_reassigned', ?, ?, ?)`,
            [oldDriverUserId, 'Order reassigned', `Order #${id} has been reassigned to another driver`, id]
          );
          emitSafe(req.app, oldDriverUserId, 'order_reassigned', {
            order_id: Number(id),
            message: 'An order has been reassigned to another driver',
          });
        }
      }
    } catch (notifyErr) {
      console.error('[company] reassign notifications failed:', notifyErr.message);
    }

    return res.json({ success: true, message: 'Driver reassigned.' });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[company] rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// GET /api/company/categories
async function getCategories(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);

    const [categories] = await pool.query(
      `SELECT pc.*, c.name AS company_name
         FROM product_categories pc
         LEFT JOIN companies c ON c.id = pc.company_id
        WHERE pc.company_id IS NULL OR pc.company_id = ?
        ORDER BY pc.name ASC`,
      [company.id]
    );

    return res.json({ success: true, data: categories });
  } catch (err) {
    return next(err);
  }
}

// GET /api/company/products
async function getProducts(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);

    const [products] = await pool.query(
      `SELECT p.*,
              pt.name AS product_type_name,
              pc.name AS category_name,
              JSON_ARRAYAGG(
                JSON_OBJECT('id', pi.id, 'url', pi.image_url, 'sort_order', pi.sort_order)
              ) AS images,
              (SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                          'id', pu.id,
                          'unit_name', pu.unit_name,
                          'units_count', pu.units_count,
                          'discount_percent', pu.discount_percent,
                          'final_price', pu.final_price,
                          'is_default', pu.is_default
                        ))
                 FROM product_units pu WHERE pu.product_id = p.id) AS units
         FROM products p
         JOIN product_types pt ON pt.id = p.product_type_id
         JOIN product_categories pc ON pc.id = p.category_id
         LEFT JOIN product_images pi ON pi.product_id = p.id
        WHERE p.company_id = ?
        GROUP BY p.id
        ORDER BY p.created_at DESC`,
      [company.id]
    );

    for (const product of products) {
      product.images = parseAgg(product.images).sort(
        (a, b) => a.sort_order - b.sort_order
      );
      // smallest pack first so the form and cards read in a sensible order
      product.units = parseAgg(product.units).sort(
        (a, b) => Number(a.units_count) - Number(b.units_count)
      );
    }

    return res.json({ success: true, data: products });
  } catch (err) {
    return next(err);
  }
}

// POST /api/company/products
async function createProduct(req, res, next) {
  let conn;
  try {
    const company = await getCompany(req.user.userId);
    const {
      product_type_id,
      category_id,
      name,
      price,
      quantity_in_stock,
      description,
      has_offer,
      offer_price,
      offer_starts_at,
      offer_ends_at,
      units,
    } = req.body || {};

    if (!product_type_id || !category_id || !name || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'product_type_id, category_id, name, and price are required',
      });
    }

    const priceNum = Number(price);
    if (!(priceNum > 0)) {
      return res
        .status(400)
        .json({ success: false, message: 'price must be greater than 0' });
    }

    // if they flagged an offer, an offer_price is mandatory and has to be positive
    const hasOffer = has_offer === true || has_offer === 'true' || has_offer === 1;
    let offerPriceNum = null;
    if (hasOffer) {
      offerPriceNum = Number(offer_price);
      if (!(offerPriceNum > 0)) {
        return res.status(400).json({
          success: false,
          message: 'offer_price is required and must be greater than 0 when has_offer is true',
        });
      }
      // an expiry date is optional, but if one is given it can't already be past
      if (offer_ends_at && !isFutureDate(offer_ends_at)) {
        return res.status(400).json({
          success: false,
          message: 'Offer expiry date must be in the future',
        });
      }
    }

    // make sure the type is real
    const [types] = await pool.query(
      'SELECT id FROM product_types WHERE id = ? LIMIT 1',
      [product_type_id]
    );
    if (types.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid product_type_id' });
    }

    // category has to be a general one or one this company owns - can't borrow another company's
    const [cats] = await pool.query(
      `SELECT id FROM product_categories
        WHERE id = ? AND (company_id = ? OR company_id IS NULL) LIMIT 1`,
      [category_id, company.id]
    );
    if (cats.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid category_id' });
    }

    // packaging. if they didn't send any, give it a default "Single" so the product is sellable
    const unitsInput =
      Array.isArray(units) && units.length > 0
        ? units
        : [{ unit_name: 'Single', units_count: 1, discount_percent: 0, is_default: true }];
    const normalized = normalizeUnits(unitsInput);
    if (normalized.error) {
      return res.status(400).json({ success: false, message: normalized.error });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO products
         (company_id, product_type_id, category_id, name, description, price,
          quantity_in_stock, has_offer, offer_price, offer_starts_at, offer_ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company.id,
        product_type_id,
        category_id,
        name,
        description || null,
        priceNum,
        quantity_in_stock !== undefined ? Number(quantity_in_stock) : 0,
        hasOffer,
        offerPriceNum,
        hasOffer ? offer_starts_at || null : null,
        hasOffer ? offer_ends_at || null : null,
      ]
    );
    const productId = result.insertId;

    for (const u of normalized.units) {
      await conn.query(
        `INSERT INTO product_units
           (product_id, unit_name, units_count, discount_percent, final_price, is_default)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [productId, u.unit_name, u.units_count, u.discount_percent, u.final_price, u.is_default]
      );
    }

    await conn.commit();
    conn.release();
    conn = null;

    return res.status(201).json({ success: true, data: { id: productId } });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[company] rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// PATCH /api/company/products/:id
async function updateProduct(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);
    const { id } = req.params;

    const [products] = await pool.query(
      'SELECT id FROM products WHERE id = ? AND company_id = ? LIMIT 1',
      [id, company.id]
    );
    if (products.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });
    }

    // if they're setting an offer expiry, it has to be in the future (a non-null past date would
    // save an offer that's invisible from the start). null clears the date and is fine.
    if (
      Object.prototype.hasOwnProperty.call(req.body || {}, 'offer_ends_at') &&
      req.body.offer_ends_at != null &&
      !isFutureDate(req.body.offer_ends_at)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Offer expiry date must be in the future',
      });
    }

    const allowed = [
      'name',
      'description',
      'price',
      'quantity_in_stock',
      'is_active',
      'has_offer',
      'offer_price',
      'offer_starts_at',
      'offer_ends_at',
      'product_type_id',
      'category_id',
    ];

    const sets = [];
    const params = [];
    for (const field of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
        sets.push(`${field} = ?`);
        params.push(req.body[field]);
      }
    }

    if (sets.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'No valid fields to update' });
    }

    params.push(id);
    await pool.query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = ?`,
      params
    );

    return res.json({ success: true, message: 'Product updated.' });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/company/products/:id
async function deleteProduct(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);
    const { id } = req.params;

    const [products] = await pool.query(
      'SELECT id FROM products WHERE id = ? AND company_id = ? LIMIT 1',
      [id, company.id]
    );
    if (products.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });
    }

    // can't hard-delete a product that's on an order (order_items.product_id is RESTRICT).
    // catch it here BEFORE we touch Cloudinary - otherwise we'd nuke the images and then the
    // DELETE fails on the FK anyway, leaving a live product with no pictures
    const [refRows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM order_items WHERE product_id = ?',
      [id]
    );
    if (refRows[0].cnt > 0) {
      return res.status(400).json({
        success: false,
        message:
          'This product appears on existing orders and cannot be deleted. Deactivate it instead.',
      });
    }

    // clear the images off Cloudinary first, best-effort - a leftover image there is harmless
    const [images] = await pool.query(
      'SELECT cloudinary_id FROM product_images WHERE product_id = ?',
      [id]
    );
    for (const img of images) {
      try {
        await cloudinary.uploader.destroy(img.cloudinary_id);
      } catch (cErr) {
        console.error('[company] cloudinary destroy failed:', cErr.message);
      }
    }

    // the FK cascade takes the product_images rows with it
    await pool.query('DELETE FROM products WHERE id = ?', [id]);

    return res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    return next(err);
  }
}

// POST /api/company/products/:id/images
async function uploadProductImages(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);
    const { id } = req.params;

    const [products] = await pool.query(
      'SELECT id FROM products WHERE id = ? AND company_id = ? LIMIT 1',
      [id, company.id]
    );
    if (products.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'No images uploaded' });
    }

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM product_images WHERE product_id = ?',
      [id]
    );
    const existing = countRows[0].cnt;

    if (existing + files.length > 4) {
      return res.status(400).json({
        success: false,
        message: `Cannot exceed 4 images per product. Currently has ${existing}.`,
      });
    }

    const inserted = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: `pharma-platform/products/${id}`,
      });

      const sortOrder = existing + i;
      const [result] = await pool.query(
        `INSERT INTO product_images (product_id, image_url, cloudinary_id, sort_order)
         VALUES (?, ?, ?, ?)`,
        [id, uploadResult.secure_url, uploadResult.public_id, sortOrder]
      );

      inserted.push({
        id: result.insertId,
        url: uploadResult.secure_url,
        sort_order: sortOrder,
      });
    }

    return res.status(201).json({ success: true, data: inserted });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/company/products/:id/images/:imgId
async function deleteProductImage(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);
    const { id, imgId } = req.params;

    const [products] = await pool.query(
      'SELECT id FROM products WHERE id = ? AND company_id = ? LIMIT 1',
      [id, company.id]
    );
    if (products.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });
    }

    const [images] = await pool.query(
      'SELECT * FROM product_images WHERE id = ? AND product_id = ? LIMIT 1',
      [imgId, id]
    );
    if (images.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Image not found' });
    }

    // drop it from Cloudinary too, best-effort
    try {
      await cloudinary.uploader.destroy(images[0].cloudinary_id);
    } catch (cErr) {
      console.error('[company] cloudinary destroy failed:', cErr.message);
    }

    await pool.query('DELETE FROM product_images WHERE id = ?', [imgId]);

    return res.json({ success: true, message: 'Image deleted.' });
  } catch (err) {
    return next(err);
  }
}

// load a product that belongs to this company, or throw 404
async function getOwnedProduct(companyId, productId) {
  const [rows] = await pool.query(
    'SELECT * FROM products WHERE id = ? AND company_id = ? LIMIT 1',
    [productId, companyId]
  );
  if (rows.length === 0) {
    throw new AppError('Product not found', 404);
  }
  return rows[0];
}

// GET /api/company/products/:id/units
async function getProductUnits(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);
    const product = await getOwnedProduct(company.id, req.params.id);

    const [units] = await pool.query(
      `SELECT id, product_id, unit_name, units_count, discount_percent,
              final_price, is_default, created_at, updated_at
         FROM product_units
        WHERE product_id = ?
        ORDER BY units_count ASC, id ASC`,
      [product.id]
    );

    // tack on the computed price so the company UI can show a live preview per unit
    const withPrice = units.map((u) => ({
      ...u,
      effective_price: unitEffectivePrice(product, u),
    }));

    return res.json({ success: true, data: withPrice });
  } catch (err) {
    return next(err);
  }
}

// POST /api/company/products/:id/units
async function addProductUnit(req, res, next) {
  let conn;
  try {
    const company = await getCompany(req.user.userId);
    const product = await getOwnedProduct(company.id, req.params.id);
    const { unit_name, units_count, discount_percent, final_price, is_default } =
      req.body || {};

    // run the single row through normalizeUnits so it gets the same validation as create
    const normalized = normalizeUnits([
      { unit_name, units_count, discount_percent, final_price, is_default: false },
    ]);
    if (normalized.error) {
      return res.status(400).json({ success: false, message: normalized.error });
    }
    const u = normalized.units[0];

    // names are unique per product (DB enforces it too, this is just a nicer error)
    const [dupes] = await pool.query(
      'SELECT id FROM product_units WHERE product_id = ? AND LOWER(unit_name) = LOWER(?) LIMIT 1',
      [product.id, u.unit_name]
    );
    if (dupes.length > 0) {
      return res.status(400).json({
        success: false,
        message: `A "${u.unit_name}" unit already exists for this product`,
      });
    }

    const makeDefault = is_default === true || is_default === 1;

    conn = await pool.getConnection();
    await conn.beginTransaction();

    if (makeDefault) {
      await conn.query(
        'UPDATE product_units SET is_default = FALSE WHERE product_id = ?',
        [product.id]
      );
    }

    const [result] = await conn.query(
      `INSERT INTO product_units
         (product_id, unit_name, units_count, discount_percent, final_price, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [product.id, u.unit_name, u.units_count, u.discount_percent, u.final_price, makeDefault]
    );

    await conn.commit();
    conn.release();
    conn = null;

    return res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[company] rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// PUT /api/company/products/units/:unitId
async function updateProductUnit(req, res, next) {
  let conn;
  try {
    const company = await getCompany(req.user.userId);
    const { unitId } = req.params;

    // the unit has to hang off a product this company owns
    const [units] = await pool.query(
      `SELECT pu.*
         FROM product_units pu
         JOIN products p ON p.id = pu.product_id
        WHERE pu.id = ? AND p.company_id = ? LIMIT 1`,
      [unitId, company.id]
    );
    if (units.length === 0) {
      return res.status(404).json({ success: false, message: 'Packaging unit not found' });
    }
    const existing = units[0];

    const body = req.body || {};
    const merged = {
      unit_name: body.unit_name !== undefined ? body.unit_name : existing.unit_name,
      units_count: body.units_count !== undefined ? body.units_count : existing.units_count,
      discount_percent:
        body.discount_percent !== undefined ? body.discount_percent : existing.discount_percent,
      final_price: body.final_price !== undefined ? body.final_price : existing.final_price,
    };

    const normalized = normalizeUnits([{ ...merged, is_default: false }]);
    if (normalized.error) {
      return res.status(400).json({ success: false, message: normalized.error });
    }
    const u = normalized.units[0];

    // name still has to be unique among the product's other units (skip this row itself)
    const [dupes] = await pool.query(
      'SELECT id FROM product_units WHERE product_id = ? AND LOWER(unit_name) = LOWER(?) AND id <> ? LIMIT 1',
      [existing.product_id, u.unit_name, unitId]
    );
    if (dupes.length > 0) {
      return res.status(400).json({
        success: false,
        message: `A "${u.unit_name}" unit already exists for this product`,
      });
    }

    // if they passed is_default explicitly, respect it (lets them move the default to this unit),
    // otherwise leave the current flag alone
    let makeDefault;
    if (body.is_default !== undefined) {
      makeDefault = body.is_default === true || body.is_default === 1;
    } else {
      makeDefault = existing.is_default === 1 || existing.is_default === true;
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // only one default per product, so if this one becomes it, unset the others
    if (makeDefault) {
      await conn.query(
        'UPDATE product_units SET is_default = FALSE WHERE product_id = ? AND id <> ?',
        [existing.product_id, unitId]
      );
    }

    await conn.query(
      `UPDATE product_units
          SET unit_name = ?, units_count = ?, discount_percent = ?, final_price = ?, is_default = ?
        WHERE id = ?`,
      [u.unit_name, u.units_count, u.discount_percent, u.final_price, makeDefault, unitId]
    );

    await conn.commit();
    conn.release();
    conn = null;

    return res.json({ success: true, message: 'Packaging unit updated.' });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[company] rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// DELETE /api/company/products/units/:unitId
async function deleteProductUnit(req, res, next) {
  let conn;
  try {
    const company = await getCompany(req.user.userId);
    const { unitId } = req.params;

    const [units] = await pool.query(
      `SELECT pu.*
         FROM product_units pu
         JOIN products p ON p.id = pu.product_id
        WHERE pu.id = ? AND p.company_id = ? LIMIT 1`,
      [unitId, company.id]
    );
    if (units.length === 0) {
      return res.status(404).json({ success: false, message: 'Packaging unit not found' });
    }
    const target = units[0];

    // a product always needs at least one packaging option, don't let them delete the last one
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM product_units WHERE product_id = ?',
      [target.product_id]
    );
    if (countRows[0].cnt <= 1) {
      return res.status(400).json({
        success: false,
        message: 'A product must keep at least one packaging unit',
      });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query('DELETE FROM product_units WHERE id = ?', [unitId]);

    // if we just deleted the default, promote the smallest one that's left
    if (target.is_default === 1 || target.is_default === true) {
      await conn.query(
        `UPDATE product_units
            SET is_default = TRUE
          WHERE product_id = ?
          ORDER BY units_count ASC, id ASC
          LIMIT 1`,
        [target.product_id]
      );
    }

    await conn.commit();
    conn.release();
    conn = null;

    return res.json({ success: true, message: 'Packaging unit deleted.' });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[company] rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// GET /api/company/drivers
async function getDrivers(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);
    const { status } = req.query;

    const conditions = ['d.company_id = ?'];
    const params = [company.id];
    if (status) {
      conditions.push('d.registration_status = ?');
      params.push(status);
    }

    const [drivers] = await pool.query(
      `SELECT d.*, u.email
         FROM drivers d
         JOIN users u ON u.id = d.user_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY d.registered_at DESC`,
      params
    );

    return res.json({ success: true, data: drivers });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/company/drivers/:id/accept
async function acceptDriver(req, res, next) {
  let conn;
  try {
    const company = await getCompany(req.user.userId);
    const { id } = req.params;

    const [drivers] = await pool.query(
      'SELECT * FROM drivers WHERE id = ? AND company_id = ? LIMIT 1',
      [id, company.id]
    );
    if (drivers.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Driver not found' });
    }
    const driver = drivers[0];

    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query(
      "UPDATE drivers SET registration_status = 'accepted', is_fired = FALSE WHERE id = ?",
      [id]
    );
    await conn.query('UPDATE users SET is_active = TRUE WHERE id = ?', [
      driver.user_id,
    ]);

    await conn.commit();
    conn.release();
    conn = null;

    // let them know by email, best-effort
    const [userRows] = await pool.query(
      'SELECT email FROM users WHERE id = ? LIMIT 1',
      [driver.user_id]
    );
    if (userRows.length) {
      sendEmailSafe({
        to: userRows[0].email,
        subject: `You have been accepted at ${company.name} — PharmaBridge`,
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
            <h2 style="color:#166534">Welcome aboard</h2>
            <p>You have been accepted at <strong>${company.name}</strong>. You can now log in and start receiving deliveries.</p>
          </div>`,
      });
    }

    try {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES (?, 'driver_accepted', ?, ?)`,
        [driver.user_id, 'Application accepted', `You have been accepted at ${company.name}`]
      );
      emitSafe(req.app, driver.user_id, 'driver_accepted', {
        company_name: company.name,
      });
    } catch (notifyErr) {
      console.error('[company] driver accept notification failed:', notifyErr.message);
    }

    return res.json({ success: true, message: 'Driver accepted.' });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[company] rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// PATCH /api/company/drivers/:id/reject
async function rejectDriver(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);
    const { id } = req.params;
    const { rejection_reason } = req.body || {};

    const [drivers] = await pool.query(
      'SELECT * FROM drivers WHERE id = ? AND company_id = ? LIMIT 1',
      [id, company.id]
    );
    if (drivers.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Driver not found' });
    }
    const driver = drivers[0];

    await pool.query(
      "UPDATE drivers SET registration_status = 'rejected', rejection_reason = ? WHERE id = ?",
      [rejection_reason || null, id]
    );

    const [userRows] = await pool.query(
      'SELECT email FROM users WHERE id = ? LIMIT 1',
      [driver.user_id]
    );
    if (userRows.length) {
      sendEmailSafe({
        to: userRows[0].email,
        subject: 'Your application has been declined — PharmaBridge',
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
            <h2 style="color:#dc2626">Application Declined</h2>
            <p>Your application has been declined.</p>
            ${rejection_reason ? `<p><strong>Reason:</strong> ${rejection_reason}</p>` : ''}
          </div>`,
      });
    }

    try {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES (?, 'driver_rejected', ?, ?)`,
        [
          driver.user_id,
          'Application declined',
          rejection_reason
            ? `Your application was declined. Reason: ${rejection_reason}`
            : 'Your application was declined.',
        ]
      );
      emitSafe(req.app, driver.user_id, 'driver_rejected', {
        reason: rejection_reason || null,
      });
    } catch (notifyErr) {
      console.error('[company] driver reject notification failed:', notifyErr.message);
    }

    return res.json({ success: true, message: 'Driver rejected.' });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/company/drivers/:id  (fire driver)
async function fireDriver(req, res, next) {
  let conn;
  try {
    const company = await getCompany(req.user.userId);
    const { id } = req.params;

    const [drivers] = await pool.query(
      'SELECT * FROM drivers WHERE id = ? AND company_id = ? LIMIT 1',
      [id, company.id]
    );
    if (drivers.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Driver not found' });
    }
    const driver = drivers[0];

    if (driver.is_fired) {
      return res
        .status(400)
        .json({ success: false, message: 'Driver is already terminated' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query('UPDATE drivers SET is_fired = TRUE WHERE id = ?', [id]);
    await conn.query('UPDATE users SET is_active = FALSE WHERE id = ?', [
      driver.user_id,
    ]);

    await conn.commit();
    conn.release();
    conn = null;

    const [userRows] = await pool.query(
      'SELECT email FROM users WHERE id = ? LIMIT 1',
      [driver.user_id]
    );
    if (userRows.length) {
      sendEmailSafe({
        to: userRows[0].email,
        subject: `Your employment at ${company.name} has been terminated — PharmaBridge`,
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
            <h2 style="color:#dc2626">Employment Terminated</h2>
            <p>Your employment at <strong>${company.name}</strong> has been terminated.</p>
          </div>`,
      });
    }

    try {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES (?, 'driver_fired', ?, ?)`,
        [driver.user_id, 'Employment terminated', `Your employment at ${company.name} has been terminated`]
      );
      emitSafe(req.app, driver.user_id, 'driver_fired', {
        company_name: company.name,
      });
    } catch (notifyErr) {
      console.error('[company] driver fire notification failed:', notifyErr.message);
    }

    return res.json({ success: true, message: 'Driver has been terminated.' });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[company] rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// DELETE /api/company/drivers/:id/delete  (permanently delete a fired driver)
async function deleteDriver(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);
    const { id } = req.params;

    const [drivers] = await pool.query(
      'SELECT * FROM drivers WHERE id = ? AND company_id = ? LIMIT 1',
      [id, company.id]
    );
    if (drivers.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Driver not found' });
    }
    const driver = drivers[0];

    if (!driver.is_fired) {
      return res.status(400).json({
        success: false,
        message: 'Driver must be terminated before deletion',
      });
    }

    // no hard delete once a driver has any history. three separate reasons:
    //  - order_status_log.changed_by is RESTRICT, so deleting a driver who ever moved an order
    //    would blow up with a raw FK error (500) instead of a clean message
    //  - orders.driver_id / financial_records.driver_id are SET NULL, so we'd lose who actually
    //    handled / collected on past orders - history goes fuzzy
    //  - ratings.driver_id is CASCADE, so we'd silently wipe their rating history
    // they're already terminated and can't log in, so keeping the row costs nothing - deactivate, don't delete
    const [refRows] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM order_status_log WHERE changed_by = ?) +
         (SELECT COUNT(*) FROM orders            WHERE driver_id  = ?) +
         (SELECT COUNT(*) FROM financial_records WHERE driver_id  = ?) AS cnt`,
      [driver.user_id, id, id]
    );
    if (refRows[0].cnt > 0) {
      return res.status(400).json({
        success: false,
        message:
          'This driver has delivery history and cannot be permanently deleted. They remain terminated.',
      });
    }

    // delete the user and the FK cascade takes the driver row with it
    await pool.query('DELETE FROM users WHERE id = ?', [driver.user_id]);

    return res.json({ success: true, message: 'Driver permanently deleted.' });
  } catch (err) {
    return next(err);
  }
}

// GET /api/company/financial
async function getFinancial(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);
    const { pharmacy_id, from, to, payment_status } = req.query;

    const conditions = ['fr.company_id = ?'];
    const params = [company.id];

    if (pharmacy_id) {
      conditions.push('fr.pharmacy_id = ?');
      params.push(pharmacy_id);
    }
    if (from) {
      conditions.push('fr.created_at >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('fr.created_at <= ?');
      params.push(to);
    }
    // three buckets, every record falls in exactly one:
    //   paid    -> nothing owed (debt 0) or in credit from an overpayment (< 0)
    //   partial -> some money in but a balance still remains
    //   unpaid  -> delivered and nothing collected at all
    if (payment_status === 'paid') {
      conditions.push('fr.debt_amount <= 0');
    } else if (payment_status === 'partial') {
      conditions.push('fr.debt_amount > 0 AND fr.paid_amount > 0');
    } else if (payment_status === 'unpaid') {
      conditions.push('fr.debt_amount > 0 AND fr.paid_amount = 0');
    }

    const [records] = await pool.query(
      `SELECT fr.*,
              ph.name AS pharmacy_name,
              o.status AS order_status,
              o.created_at AS order_date
         FROM financial_records fr
         JOIN pharmacies ph ON ph.id = fr.pharmacy_id
         JOIN orders o ON o.id = fr.order_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY fr.created_at DESC`,
      params
    );

    const [summary] = await pool.query(
      'SELECT * FROM v_pharmacy_debts WHERE company_id = ?',
      [company.id]
    );

    return res.json({ success: true, data: { records, summary } });
  } catch (err) {
    return next(err);
  }
}

// GET /api/company/financial/pharmacy-debt/:pharmacy_id
// what one pharmacy still owes THIS company. feeds the "Record Payment" modal so it can cap the
// amount you can collect.
async function getPharmacyDebt(req, res, next) {
  try {
    const company = await getCompany(req.user.userId);
    const pharmacyId = Number(req.params.pharmacy_id);
    if (!Number.isInteger(pharmacyId) || pharmacyId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid pharmacy_id' });
    }

    const [rows] = await pool.query(
      `SELECT COALESCE(total_debt, 0) AS total_debt
         FROM v_pharmacy_debts
        WHERE company_id = ? AND pharmacy_id = ?`,
      [company.id, pharmacyId]
    );
    const totalDebt = rows.length ? Number(rows[0].total_debt) || 0 : 0;

    return res.json({
      success: true,
      data: { pharmacy_id: pharmacyId, total_debt: totalDebt },
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/company/financial/record-payment
// logs a debt payment that isn't tied to a delivery - e.g. the pharmacy just pays down its
// balance at the counter.
// the catch is financial_records.order_id is NOT NULL, so we spin up a throwaway zero-value
// "payment order" (total 0, status delivered) and hang a financial_record off it with
// order_total = 0 and paid_amount = amount. debt_amount is generated as (order_total - paid),
// so it comes out -amount, which drops v_pharmacy_debts.total_debt by exactly `amount` while
// total_billed stays put - a payment is cash in, not a new sale.
// (early draft used order_total = current_debt instead, which double-counted: it padded
// total_billed and left debt = current_debt - amount, inflating the running balance. 0 is the
// only value that keeps the books straight.)
async function recordPayment(req, res, next) {
  let conn;
  try {
    const company = await getCompany(req.user.userId);
    const { pharmacy_id, amount } = req.body || {};

    const pharmacyId = Number(pharmacy_id);
    const payAmount = Number(amount);

    if (!Number.isInteger(pharmacyId) || pharmacyId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: 'pharmacy_id is required' });
    }
    if (Number.isNaN(payAmount) || payAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: 'amount must be greater than 0' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // same lock as deliverOrder - serialize settlements for this pharmacy so the debt read
    // below can't go stale under a concurrent payment/delivery
    await conn.query('SELECT id FROM pharmacies WHERE id = ? FOR UPDATE', [
      pharmacyId,
    ]);

    const [debtRows] = await conn.query(
      `SELECT COALESCE(SUM(debt_amount), 0) AS total_debt
         FROM financial_records
        WHERE pharmacy_id = ? AND company_id = ?`,
      [pharmacyId, company.id]
    );
    const totalDebt = Number(debtRows[0].total_debt) || 0;

    if (totalDebt <= 0) {
      await conn.rollback();
      conn.release();
      conn = null;
      return res.status(400).json({
        success: false,
        message: 'This pharmacy has no outstanding debt',
      });
    }
    if (payAmount > totalDebt) {
      await conn.rollback();
      conn.release();
      conn = null;
      return res.status(400).json({
        success: false,
        message: `Amount exceeds outstanding debt (${totalDebt.toFixed(2)})`,
      });
    }

    // the throwaway zero-value order just so financial_records.order_id has something to point at
    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (pharmacy_id, company_id, status, total_amount, paid_amount, notes)
       VALUES (?, ?, 'delivered', 0, ?, 'Manual payment record')`,
      [pharmacyId, company.id, payAmount]
    );
    const orderId = orderResult.insertId;

    // order_total 0 + paid_amount amount => debt_amount lands at -amount, which is what nets the debt down
    await conn.query(
      `INSERT INTO financial_records
         (order_id, pharmacy_id, company_id, order_total, paid_amount, previous_debt, collected_at)
       VALUES (?, ?, ?, 0, ?, ?, NOW())`,
      [orderId, pharmacyId, company.id, payAmount, totalDebt]
    );

    await conn.commit();
    conn.release();
    conn = null;

    return res.json({
      success: true,
      message: 'Payment recorded.',
      data: {
        order_id: orderId,
        amount: payAmount,
        remaining_debt: totalDebt - payAmount,
      },
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // already failing, nothing useful to do if the rollback also fails
      }
      conn.release();
    }
    return next(err);
  }
}

// GET /api/company/market - read-only. companies get to browse the whole market, their own
// products and competitors' alike.
async function getMarket(req, res, next) {
  try {
    const { search, company_id, type_id, category_id, sort } = req.query;
    const page = toInt(req.query.page, 1);
    const limit = toInt(req.query.limit, 20);
    const offset = (page - 1) * limit;
    const orderBy = SORT_MAP[sort] || SORT_MAP.newest;

    const conditions = ['p.is_active = TRUE'];
    const params = [];

    if (search) {
      conditions.push('p.name LIKE ?');
      params.push(`%${search}%`);
    }
    if (company_id) {
      conditions.push('p.company_id = ?');
      params.push(company_id);
    }
    if (type_id) {
      conditions.push('p.product_type_id = ?');
      params.push(type_id);
    }
    if (category_id) {
      conditions.push('p.category_id = ?');
      params.push(category_id);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM products p ${where}`,
      params
    );
    const total = countRows[0].total;

    const [products] = await pool.query(
      `SELECT p.id, p.name, p.price, p.offer_price, p.has_offer, p.offer_ends_at,
              p.rating_avg, p.rating_count, p.quantity_in_stock,
              c.name AS company_name, c.id AS company_id,
              pt.name AS product_type_name, pc.name AS category_name,
              (SELECT image_url FROM product_images
                WHERE product_id = p.id AND sort_order = 0 LIMIT 1) AS main_image,
              (SELECT COUNT(*) FROM product_units pu WHERE pu.product_id = p.id) AS unit_option_count,
              (SELECT COUNT(*) FROM product_units pu
                WHERE pu.product_id = p.id AND pu.discount_percent > 0) AS bulk_discount_count
         FROM products p
         JOIN companies c ON c.id = p.company_id
         JOIN product_types pt ON pt.id = p.product_type_id
         JOIN product_categories pc ON pc.id = p.category_id
         ${where}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // flatten the discount subquery into a boolean for the card
    for (const p of products) {
      p.has_bulk_discount = Number(p.bulk_discount_count) > 0;
    }

    return res.json({ success: true, data: { products, total } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
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
};
