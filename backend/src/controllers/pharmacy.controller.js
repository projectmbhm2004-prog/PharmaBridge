// ============================================================
//  Pharmacy controller
// ============================================================
//  Cart management, checkout (multi-company cart split into one
//  order per company), order
//  tracking, financial record, and product/driver ratings.
//  All handlers: try/catch -> next(err); multi-table writes use
//  transactions; socket/email are non-blocking.
// ============================================================

const pool = require('../config/db');
const { emitToUser } = require('../services/socket.service');
const { AppError } = require('../middleware/errorHandler');
const { effectivePrice, unitEffectivePrice } = require('../utils/pricing');

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Load the pharmacy row owned by the given user.
 * @param {number} userId
 * @returns {Promise<object>} pharmacy row
 * @throws {AppError} 404 when the user has no pharmacy profile
 */
async function getPharmacy(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM pharmacies WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (rows.length === 0) {
    throw new AppError('Pharmacy profile not found', 404);
  }
  return rows[0];
}

/** Non-fatal socket emit. */
function emitSafe(app, userId, event, data) {
  try {
    emitToUser(app, userId, event, data);
  } catch (err) {
    console.error('[pharmacy] socket emit failed:', err.message);
  }
}

/** Parse a positive integer with a fallback. */
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Resolve the packaging unit for a cart/checkout line.
 *  - If unitId is given it must belong to the product (else null -> caller 400).
 *  - If omitted, falls back to the product's default unit, else the smallest.
 * Returns the product_units row or null.
 */
async function resolveProductUnit(productId, unitId, conn) {
  const db = conn || pool;
  if (unitId !== undefined && unitId !== null && unitId !== '') {
    const [rows] = await db.query(
      'SELECT * FROM product_units WHERE id = ? AND product_id = ? LIMIT 1',
      [unitId, productId]
    );
    return rows.length ? rows[0] : null;
  }
  const [rows] = await db.query(
    `SELECT * FROM product_units
      WHERE product_id = ?
      ORDER BY is_default DESC, units_count ASC, id ASC
      LIMIT 1`,
    [productId]
  );
  return rows.length ? rows[0] : null;
}

// ============================================================
//  CART
// ============================================================

// GET /api/pharmacy/cart
async function getCart(req, res, next) {
  try {
    const pharmacy = await getPharmacy(req.user.userId);

    const [items] = await pool.query(
      `SELECT ci.id, ci.quantity, ci.added_at, ci.product_unit_id,
              p.id AS product_id, p.name, p.price, p.offer_price,
              p.has_offer, p.offer_ends_at, p.quantity_in_stock,
              c.id AS company_id, c.name AS company_name,
              pu.unit_name, pu.units_count, pu.discount_percent, pu.final_price,
              (SELECT image_url FROM product_images
                WHERE product_id = p.id AND sort_order = 0 LIMIT 1) AS main_image
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         JOIN companies c ON c.id = p.company_id
         LEFT JOIN product_units pu ON pu.id = ci.product_unit_id
        WHERE ci.pharmacy_id = ?
        ORDER BY ci.added_at ASC`,
      [pharmacy.id]
    );

    // Group items by company. Each group carries its own subtotal so the
    // frontend can render one section (and one resulting order) per company.
    // quantity is the number of PACKAGES; stock is tracked in BASE units, so
    // the per-line max is floor(stock / units_count).
    let totalItems = 0;
    let totalPrice = 0;
    const groupMap = new Map();

    for (const item of items) {
      const unitsCount = Number(item.units_count) || 1;
      // Per-package price (offer + packaging discount / override aware).
      const unitPrice = item.unit_name
        ? unitEffectivePrice(item, item)
        : effectivePrice(item);
      const listPerPackage = Number(item.price) * unitsCount;
      const hasOffer = unitPrice < listPerPackage;
      const subtotal = Number((unitPrice * item.quantity).toFixed(2));
      const maxQuantity = Math.floor(Number(item.quantity_in_stock) / unitsCount);

      totalItems += item.quantity;
      totalPrice += unitPrice * item.quantity;

      let group = groupMap.get(item.company_id);
      if (!group) {
        group = {
          company_id: item.company_id,
          company_name: item.company_name,
          items: [],
          subtotal: 0,
        };
        groupMap.set(item.company_id, group);
      }

      group.items.push({
        id: item.id,
        product_id: item.product_id,
        name: item.name,
        price: Number(item.price),
        offer_price: item.offer_price !== null ? Number(item.offer_price) : null,
        has_offer: hasOffer,
        effective_price: unitPrice,
        list_price: Number(listPerPackage.toFixed(2)),
        product_unit_id: item.product_unit_id,
        unit_name: item.unit_name || 'Single',
        units_count: unitsCount,
        discount_percent: Number(item.discount_percent) || 0,
        quantity: item.quantity,
        quantity_in_stock: item.quantity_in_stock,
        max_quantity: maxQuantity,
        image: item.main_image,
        subtotal,
      });
      group.subtotal = Number((group.subtotal + subtotal).toFixed(2));
    }

    return res.json({
      success: true,
      data: {
        groups: Array.from(groupMap.values()),
        total_items: totalItems,
        total_price: Number(totalPrice.toFixed(2)),
      },
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/pharmacy/cart
async function addToCart(req, res, next) {
  try {
    const pharmacy = await getPharmacy(req.user.userId);
    const { product_id, product_unit_id } = req.body || {};
    const quantity = req.body && req.body.quantity !== undefined
      ? Number(req.body.quantity)
      : 1;

    // 2. product_id present
    if (!product_id) {
      return res
        .status(400)
        .json({ success: false, message: 'product_id is required' });
    }

    // 3. quantity >= 1 (number of packages)
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res
        .status(400)
        .json({ success: false, message: 'quantity must be at least 1' });
    }

    // 4. product exists and active, AND its company is still accepted + active.
    //    Mirrors the marketplace visibility rules so a pharmacy can't add an
    //    item belonging to a deactivated / un-accepted company by id.
    const [products] = await pool.query(
      `SELECT p.*
         FROM products p
         JOIN companies c ON c.id = p.company_id
         JOIN users cu ON cu.id = c.user_id
        WHERE p.id = ? AND p.is_active = TRUE
          AND c.registration_status = 'accepted'
          AND cu.is_active = TRUE
        LIMIT 1`,
      [product_id]
    );
    if (products.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });
    }
    const product = products[0];

    // 5. resolve the selected packaging unit (or fall back to default/smallest)
    const unit = await resolveProductUnit(product_id, product_unit_id);
    if (!unit) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid packaging unit for this product' });
    }

    // 6. stock check — quantity is packages, stock is base units.
    const baseUnitsNeeded = quantity * (Number(unit.units_count) || 1);
    if (product.quantity_in_stock < baseUnitsNeeded) {
      return res
        .status(400)
        .json({ success: false, message: 'Insufficient stock' });
    }

    // 7. upsert keyed on (pharmacy, product, packaging)
    //    Multi-company cart: products from any company may coexist. They are
    //    split into one order per company at checkout. The same product may
    //    appear on several lines as long as the packaging differs — adding the
    //    SAME product + SAME packaging merges by incrementing the existing line;
    //    a DIFFERENT packaging creates a new line.
    const [existing] = await pool.query(
      `SELECT id, quantity FROM cart_items
        WHERE pharmacy_id = ? AND product_id = ? AND product_unit_id = ?
        LIMIT 1`,
      [pharmacy.id, product_id, unit.id]
    );
    if (existing.length > 0) {
      const newQuantity = existing[0].quantity + quantity;
      // Re-validate stock against the merged total (base units = packages * units_count).
      if (product.quantity_in_stock < newQuantity * (Number(unit.units_count) || 1)) {
        return res
          .status(400)
          .json({ success: false, message: 'Insufficient stock' });
      }
      await pool.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [
        newQuantity,
        existing[0].id,
      ]);
    } else {
      await pool.query(
        `INSERT INTO cart_items (pharmacy_id, product_id, quantity, product_unit_id)
         VALUES (?, ?, ?, ?)`,
        [pharmacy.id, product_id, quantity, unit.id]
      );
    }

    return res.status(201).json({ success: true, message: 'Item added to cart.' });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/pharmacy/cart/:id
async function updateCartItem(req, res, next) {
  try {
    const pharmacy = await getPharmacy(req.user.userId);
    const { id } = req.params;
    const quantity = req.body ? Number(req.body.quantity) : NaN;

    // 2. quantity >= 1
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res
        .status(400)
        .json({ success: false, message: 'quantity must be at least 1' });
    }

    // 3. cart item belongs to pharmacy
    const [items] = await pool.query(
      'SELECT * FROM cart_items WHERE id = ? AND pharmacy_id = ? LIMIT 1',
      [id, pharmacy.id]
    );
    if (items.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Cart item not found' });
    }

    // 4. stock check for new quantity (quantity is packages; stock is base
    //    units, so scale by the selected packaging's units_count).
    const [products] = await pool.query(
      'SELECT quantity_in_stock FROM products WHERE id = ? LIMIT 1',
      [items[0].product_id]
    );
    let unitsCount = 1;
    if (items[0].product_unit_id) {
      const [unitRows] = await pool.query(
        'SELECT units_count FROM product_units WHERE id = ? LIMIT 1',
        [items[0].product_unit_id]
      );
      if (unitRows.length) unitsCount = Number(unitRows[0].units_count) || 1;
    }
    if (
      products.length === 0 ||
      products[0].quantity_in_stock < quantity * unitsCount
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Insufficient stock' });
    }

    // 5. update
    await pool.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [
      quantity,
      id,
    ]);

    return res.json({ success: true, message: 'Cart updated.' });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/pharmacy/cart/:id
async function removeCartItem(req, res, next) {
  try {
    const pharmacy = await getPharmacy(req.user.userId);
    const { id } = req.params;

    const [items] = await pool.query(
      'SELECT id FROM cart_items WHERE id = ? AND pharmacy_id = ? LIMIT 1',
      [id, pharmacy.id]
    );
    if (items.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Cart item not found' });
    }

    await pool.query('DELETE FROM cart_items WHERE id = ?', [id]);

    return res.json({ success: true, message: 'Item removed from cart.' });
  } catch (err) {
    return next(err);
  }
}

// POST /api/pharmacy/cart/checkout
async function checkout(req, res, next) {
  let conn;
  try {
    const pharmacy = await getPharmacy(req.user.userId);
    const { notes } = req.body || {};

    // 2. cart items with product + company status info. We re-read product and
    //    company state here (not just at add-to-cart time) because a product can
    //    be deactivated, or its company deactivated / un-accepted, while the
    //    item is already sitting in the cart. Without this an order could be
    //    placed against a product/company that is no longer available — leaving
    //    a pending order the company can never see or act on.
    const [cartItems] = await pool.query(
      `SELECT ci.*, p.price, p.offer_price, p.has_offer, p.offer_ends_at,
              p.company_id, p.quantity_in_stock, p.name AS product_name,
              p.is_active AS product_active,
              c.name AS company_name,
              c.registration_status AS company_status,
              cu.is_active AS company_user_active,
              pu.units_count, pu.discount_percent, pu.final_price, pu.unit_name
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         JOIN companies c ON c.id = p.company_id
         JOIN users cu ON cu.id = c.user_id
         LEFT JOIN product_units pu ON pu.id = ci.product_unit_id
        WHERE ci.pharmacy_id = ?`,
      [pharmacy.id]
    );

    // 3. empty?
    if (cartItems.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Your cart is empty' });
    }

    // 4. Re-validate every item up front. If ANY item is unavailable we abort
    //    the whole checkout (no partial orders) and report exactly which
    //    products are blocking it, so the pharmacy can fix its cart.
    //    The same product can now appear on multiple lines (different packaging)
    //    that all draw from one stock pool, so the stock check is per PRODUCT
    //    and sums base units (packages * units_count) across every line.
    const neededByProduct = new Map();
    for (const item of cartItems) {
      const baseNeeded = item.quantity * (Number(item.units_count) || 1);
      neededByProduct.set(
        item.product_id,
        (neededByProduct.get(item.product_id) || 0) + baseNeeded
      );
    }
    const unavailable = [];
    const stockFlagged = new Set();
    for (const item of cartItems) {
      if (!item.product_active) {
        unavailable.push(`${item.product_name} (no longer available)`);
      } else if (item.company_status !== 'accepted' || !item.company_user_active) {
        unavailable.push(`${item.product_name} (supplier unavailable)`);
      } else if (
        !stockFlagged.has(item.product_id) &&
        item.quantity_in_stock < neededByProduct.get(item.product_id)
      ) {
        unavailable.push(`${item.product_name} (insufficient stock)`);
        stockFlagged.add(item.product_id);
      }
    }
    if (unavailable.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Some items are unavailable: ${unavailable.join(', ')}. Please update your cart and try again.`,
      });
    }

    // 5. group items by company — one order per company
    const groupMap = new Map();
    for (const item of cartItems) {
      let group = groupMap.get(item.company_id);
      if (!group) {
        group = { company_id: item.company_id, items: [], total: 0 };
        groupMap.set(item.company_id, group);
      }
      group.items.push(item);
      // Per-package price honours the packaging discount/override AND the offer.
      group.total += unitEffectivePrice(item, item) * item.quantity;
    }
    const groups = Array.from(groupMap.values());

    // 6. single transaction across all company groups — all or nothing
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const createdOrders = [];
    for (const group of groups) {
      const groupTotal = Number(group.total.toFixed(2));

      const [orderResult] = await conn.query(
        `INSERT INTO orders (pharmacy_id, company_id, status, total_amount, notes)
         VALUES (?, ?, 'pending', ?, ?)`,
        [pharmacy.id, group.company_id, groupTotal, notes || null]
      );
      const orderId = orderResult.insertId;

      // Lock + re-validate stock under the transaction, once per distinct
      // product, summing base units across all of this product's lines (a
      // product may appear on multiple lines with different packaging). Stock is
      // DECREMENTED here, at checkout (order creation), not when the company
      // accepts. Reserving stock the moment an order is placed prevents oversell
      // when several pharmacies order the same product before the company has
      // had a chance to review its pending orders. Stock is restored if the
      // order is later rejected / cancelled (see company.rejectOrder and the
      // admin company-deactivation auto-reject).
      const groupNeed = new Map();
      for (const item of group.items) {
        const baseNeeded = item.quantity * (Number(item.units_count) || 1);
        groupNeed.set(
          item.product_id,
          (groupNeed.get(item.product_id) || 0) + baseNeeded
        );
      }
      for (const [productId, baseNeeded] of groupNeed) {
        const [locked] = await conn.query(
          'SELECT quantity_in_stock, is_active FROM products WHERE id = ? FOR UPDATE',
          [productId]
        );
        if (
          locked.length === 0 ||
          !locked[0].is_active ||
          locked[0].quantity_in_stock < baseNeeded
        ) {
          const blocked = group.items.find((it) => it.product_id === productId);
          throw new AppError(
            `${blocked ? blocked.product_name : 'A product'} became unavailable during checkout. Please try again.`,
            400
          );
        }
        // Reserve the stock immediately. The row is locked (FOR UPDATE above)
        // until this transaction commits, so concurrent checkouts can't oversell.
        await conn.query(
          'UPDATE products SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?',
          [baseNeeded, productId]
        );
      }

      for (const item of group.items) {
        // quantity_ordered = number of packages; unit_price = price per package
        // (offer + packaging discount applied). product_unit_id records which
        // packaging was bought so the accept-time stock decrement is correct.
        await conn.query(
          `INSERT INTO order_items
             (order_id, product_id, quantity_ordered, unit_price, product_unit_id)
           VALUES (?, ?, ?, ?, ?)`,
          [orderId, item.product_id, item.quantity, unitEffectivePrice(item, item), item.product_unit_id || null]
        );
      }

      createdOrders.push({
        order_id: orderId,
        company_id: group.company_id,
        company_name: group.items[0].company_name,
        total_amount: groupTotal,
      });
    }

    // 7. clear the cart only after every order is in place
    await conn.query('DELETE FROM cart_items WHERE pharmacy_id = ?', [
      pharmacy.id,
    ]);

    await conn.commit();
    conn.release();
    conn = null;

    // 8. notify each company (non-blocking)
    for (const order of createdOrders) {
      try {
        const [companies] = await pool.query(
          'SELECT user_id FROM companies WHERE id = ? LIMIT 1',
          [order.company_id]
        );
        const companyUserId = companies.length ? companies[0].user_id : null;
        if (companyUserId) {
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, body, related_order_id)
             VALUES (?, 'order_received', ?, ?, ?)`,
            [companyUserId, 'New order received', 'You have received a new order', order.order_id]
          );
          emitSafe(req.app, companyUserId, 'order_received', {
            order_id: order.order_id,
            message: 'New order received',
          });
        }
      } catch (notifyErr) {
        console.error('[pharmacy] checkout notification failed:', notifyErr.message);
      }
    }

    const count = createdOrders.length;
    return res.status(201).json({
      success: true,
      message: `${count} order${count === 1 ? '' : 's'} placed successfully`,
      data: { orders: createdOrders },
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error('[pharmacy] rollback failed:', e.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// ============================================================
//  ORDERS
// ============================================================

// GET /api/pharmacy/orders
async function getOrders(req, res, next) {
  try {
    const pharmacy = await getPharmacy(req.user.userId);
    const { status } = req.query;
    const page = toInt(req.query.page, 1);
    const limit = toInt(req.query.limit, 20);
    const offset = (page - 1) * limit;

    const conditions = ['o.pharmacy_id = ?'];
    const params = [pharmacy.id];
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
              c.name AS company_name,
              d.full_name AS driver_name,
              d.phone AS driver_phone,
              d.rating_avg AS driver_rating
         FROM orders o
         JOIN companies c ON c.id = o.company_id
         LEFT JOIN drivers d ON d.id = o.driver_id
         ${where}
        ORDER BY o.created_at DESC
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

// GET /api/pharmacy/orders/:id
async function getOrderDetail(req, res, next) {
  try {
    const pharmacy = await getPharmacy(req.user.userId);
    const { id } = req.params;

    const [orders] = await pool.query(
      `SELECT o.*,
              c.name AS company_name,
              c.phone AS company_phone,
              d.full_name AS driver_name,
              d.phone AS driver_phone,
              d.rating_avg AS driver_rating
         FROM orders o
         JOIN companies c ON c.id = o.company_id
         LEFT JOIN drivers d ON d.id = o.driver_id
        WHERE o.id = ? AND o.pharmacy_id = ? LIMIT 1`,
      [id, pharmacy.id]
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
              pu.unit_name, pu.units_count,
              (SELECT image_url FROM product_images
                WHERE product_id = p.id AND sort_order = 0 LIMIT 1) AS main_image
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         LEFT JOIN product_units pu ON pu.id = oi.product_unit_id
        WHERE oi.order_id = ?`,
      [id]
    );

    const [statusLog] = await pool.query(
      `SELECT osl.*, u.role AS changed_by_role
         FROM order_status_log osl
         JOIN users u ON u.id = osl.changed_by
        WHERE osl.order_id = ?
        ORDER BY osl.changed_at ASC`,
      [id]
    );

    const [ratings] = await pool.query(
      'SELECT * FROM ratings WHERE order_id = ? AND pharmacy_id = ?',
      [id, pharmacy.id]
    );

    const canRate =
      ['delivered', 'partially_delivered'].includes(order.status) &&
      ratings.length === 0;

    return res.json({
      success: true,
      data: {
        ...order,
        items,
        status_log: statusLog,
        ratings,
        can_rate: canRate,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// ============================================================
//  FINANCIAL
// ============================================================

// GET /api/pharmacy/financial
async function getFinancial(req, res, next) {
  try {
    const pharmacy = await getPharmacy(req.user.userId);

    const [records] = await pool.query(
      `SELECT fr.*,
              c.name AS company_name,
              o.status AS order_status,
              o.created_at AS order_date
         FROM financial_records fr
         JOIN companies c ON c.id = fr.company_id
         JOIN orders o ON o.id = fr.order_id
        WHERE fr.pharmacy_id = ?
        ORDER BY fr.created_at DESC`,
      [pharmacy.id]
    );

    const [summary] = await pool.query(
      'SELECT * FROM v_pharmacy_debts WHERE pharmacy_id = ?',
      [pharmacy.id]
    );

    return res.json({ success: true, data: { records, summary } });
  } catch (err) {
    return next(err);
  }
}

// ============================================================
//  RATINGS
// ============================================================

// POST /api/pharmacy/ratings
async function createRating(req, res, next) {
  try {
    const pharmacy = await getPharmacy(req.user.userId);
    const { order_id, product_id, driver_id, stars } = req.body || {};

    // 2. required
    if (!order_id || stars === undefined || stars === null) {
      return res
        .status(400)
        .json({ success: false, message: 'order_id and stars are required' });
    }

    // 3. stars 1..5 integer
    const starsNum = Number(stars);
    if (!Number.isInteger(starsNum) || starsNum < 1 || starsNum > 5) {
      return res.status(400).json({
        success: false,
        message: 'stars must be an integer between 1 and 5',
      });
    }

    // 4. exactly one target
    const hasProduct = product_id !== undefined && product_id !== null;
    const hasDriver = driver_id !== undefined && driver_id !== null;
    if (hasProduct === hasDriver) {
      return res.status(400).json({
        success: false,
        message: 'Provide exactly one of product_id or driver_id',
      });
    }

    // 5. order belongs to pharmacy
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE id = ? AND pharmacy_id = ? LIMIT 1',
      [order_id, pharmacy.id]
    );
    if (orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }
    const order = orders[0];

    // 6. delivered / partially_delivered only
    if (!['delivered', 'partially_delivered'].includes(order.status)) {
      return res.status(403).json({
        success: false,
        message: 'Rating is only allowed after delivery is complete',
      });
    }

    // 7. product belongs to order
    if (hasProduct) {
      const [oi] = await pool.query(
        'SELECT id FROM order_items WHERE order_id = ? AND product_id = ? LIMIT 1',
        [order_id, product_id]
      );
      if (oi.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Product is not part of this order',
        });
      }
    }

    // 8. driver assigned to order
    if (hasDriver) {
      if (order.driver_id === null || Number(order.driver_id) !== Number(driver_id)) {
        return res.status(400).json({
          success: false,
          message: 'Driver is not assigned to this order',
        });
      }
    }

    // 9. insert (triggers update rating_avg automatically)
    try {
      await pool.query(
        `INSERT INTO ratings (pharmacy_id, order_id, product_id, driver_id, stars)
         VALUES (?, ?, ?, ?, ?)`,
        [
          pharmacy.id,
          order_id,
          hasProduct ? product_id : null,
          hasDriver ? driver_id : null,
          starsNum,
        ]
      );
    } catch (dbErr) {
      if (dbErr.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          success: false,
          message: 'You have already rated this item for this order',
        });
      }
      throw dbErr;
    }

    return res.status(201).json({ success: true, message: 'Rating submitted.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  checkout,
  getOrders,
  getOrderDetail,
  getFinancial,
  createRating,
};
