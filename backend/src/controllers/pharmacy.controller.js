// pharmacy controller - cart, checkout (a mixed-company cart becomes one order per company),
// order tracking, the financial view, and product/driver ratings. writes that span tables run
// in transactions, socket/email stuff is fire-and-forget.

const pool = require('../config/db');
const { emitToUser } = require('../services/socket.service');
const { AppError } = require('../middleware/errorHandler');
const { effectivePrice, unitEffectivePrice } = require('../utils/pricing');

// grab the pharmacy row for this user, 404 if they somehow have no profile
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

// wrap emit so a socket hiccup never breaks the request
function emitSafe(app, userId, event, data) {
  try {
    emitToUser(app, userId, event, data);
  } catch (err) {
    console.error('[pharmacy] socket emit failed:', err.message);
  }
}

// positive int or fallback, for page/limit
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// figure out which packaging unit a cart/checkout line means.
// if they passed a unitId it has to belong to the product (else null -> caller returns 400).
// if they didn't, fall back to the product's default unit, or the smallest one.
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

    // bucket the items by company, each bucket gets its own subtotal so the frontend can
    // show one section per company (and it'll turn into one order per company at checkout).
    // quantity is in PACKAGES but stock is in BASE units, so the line max is floor(stock / units_count).
    let totalItems = 0;
    let totalPrice = 0;
    const groupMap = new Map();

    for (const item of items) {
      const unitsCount = Number(item.units_count) || 1;
      // price per package, taking the offer and the packaging discount/override into account
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

    if (!product_id) {
      return res
        .status(400)
        .json({ success: false, message: 'product_id is required' });
    }

    // quantity is the number of packages, has to be a whole number >= 1
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res
        .status(400)
        .json({ success: false, message: 'quantity must be at least 1' });
    }

    // product has to exist + be active, and its company still accepted + active. same rules as the
    // market listing, otherwise someone could add a hidden company's product straight by id
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

    // pin down which packaging they meant (or default to the smallest)
    const unit = await resolveProductUnit(product_id, product_unit_id);
    if (!unit) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid packaging unit for this product' });
    }

    // stock check - packages * units_count gives base units, which is what stock is in
    const baseUnitsNeeded = quantity * (Number(unit.units_count) || 1);
    if (product.quantity_in_stock < baseUnitsNeeded) {
      return res
        .status(400)
        .json({ success: false, message: 'Insufficient stock' });
    }

    // upsert keyed on (pharmacy, product, packaging). the cart can hold stuff from any company
    // at once - we split it per company at checkout. same product + same packaging just bumps the
    // existing line's qty, same product + different packaging is a separate line.
    const [existing] = await pool.query(
      `SELECT id, quantity FROM cart_items
        WHERE pharmacy_id = ? AND product_id = ? AND product_unit_id = ?
        LIMIT 1`,
      [pharmacy.id, product_id, unit.id]
    );
    if (existing.length > 0) {
      const newQuantity = existing[0].quantity + quantity;
      // re-check stock against the merged quantity, not just what they're adding now
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

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res
        .status(400)
        .json({ success: false, message: 'quantity must be at least 1' });
    }

    // make sure this cart row is actually theirs
    const [items] = await pool.query(
      'SELECT * FROM cart_items WHERE id = ? AND pharmacy_id = ? LIMIT 1',
      [id, pharmacy.id]
    );
    if (items.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Cart item not found' });
    }

    // check the new quantity fits in stock - again packages * units_count = base units
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

    // pull the cart rows along with current product + company status. we re-read this here, not
    // just at add-to-cart time, because a product (or its whole company) can get deactivated while
    // it's sitting in the cart. skip this and you could place an order against a dead product/company
    // - a pending order nobody can ever see or act on.
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

    if (cartItems.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Your cart is empty' });
    }

    // validate everything up front. if even one item is unavailable we bail on the whole
    // checkout (no half orders) and tell them exactly which products are the problem.
    // a product can sit on several lines now (different packaging) all sharing one stock pool,
    // so the stock check is per PRODUCT, summing base units across every line for it.
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

    // split the cart into one group per company - each becomes its own order
    const groupMap = new Map();
    for (const item of cartItems) {
      let group = groupMap.get(item.company_id);
      if (!group) {
        group = { company_id: item.company_id, items: [], total: 0 };
        groupMap.set(item.company_id, group);
      }
      group.items.push(item);
      // per-package price, offer + packaging discount/override baked in
      group.total += unitEffectivePrice(item, item) * item.quantity;
    }
    const groups = Array.from(groupMap.values());

    // one transaction wrapping every company's order - all of them commit or none do
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

      // lock and re-check stock inside the transaction, once per distinct product, summing base
      // units across all its lines (same product can appear with different packaging). important:
      // we decrement stock HERE at checkout, not when the company accepts. reserving the moment the
      // order is placed is what stops oversell when several pharmacies grab the same product before
      // the company has even looked at its pending orders. stock comes back if the order is later
      // rejected/cancelled (see company.rejectOrder and the admin deactivation auto-reject).
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
        // take the stock now. the row's locked from the FOR UPDATE above until we commit,
        // so two checkouts racing on the same product can't both succeed past stock
        await conn.query(
          'UPDATE products SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?',
          [baseNeeded, productId]
        );
      }

      for (const item of group.items) {
        // quantity_ordered is packages, unit_price is the per-package price with offer + discount.
        // we stash product_unit_id too so later steps know the base-unit conversion for this line.
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

    // only wipe the cart once all the orders are safely in
    await conn.query('DELETE FROM cart_items WHERE pharmacy_id = ?', [
      pharmacy.id,
    ]);

    await conn.commit();
    conn.release();
    conn = null;

    // ping each company about their new order, best-effort
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

// GET /api/pharmacy/financial
async function getFinancial(req, res, next) {
  try {
    const pharmacy = await getPharmacy(req.user.userId);

    const [records] = await pool.query(
      `SELECT fr.*,
              c.name AS company_name,
              o.status AS order_status,
              o.created_at AS order_date,
              (SELECT GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ')
                 FROM order_items oi JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = fr.order_id) AS product_names
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

// POST /api/pharmacy/ratings
async function createRating(req, res, next) {
  try {
    const pharmacy = await getPharmacy(req.user.userId);
    const { order_id, product_id, driver_id, stars } = req.body || {};

    if (!order_id || stars === undefined || stars === null) {
      return res
        .status(400)
        .json({ success: false, message: 'order_id and stars are required' });
    }

    // stars has to be a whole 1-5
    const starsNum = Number(stars);
    if (!Number.isInteger(starsNum) || starsNum < 1 || starsNum > 5) {
      return res.status(400).json({
        success: false,
        message: 'stars must be an integer between 1 and 5',
      });
    }

    // rate exactly one thing - a product OR a driver, not both, not neither
    const hasProduct = product_id !== undefined && product_id !== null;
    const hasDriver = driver_id !== undefined && driver_id !== null;
    if (hasProduct === hasDriver) {
      return res.status(400).json({
        success: false,
        message: 'Provide exactly one of product_id or driver_id',
      });
    }

    // the order has to be theirs
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

    // and it has to actually be delivered before they can rate it
    if (!['delivered', 'partially_delivered'].includes(order.status)) {
      return res.status(403).json({
        success: false,
        message: 'Rating is only allowed after delivery is complete',
      });
    }

    // can't rate a product that wasn't in this order
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

    // ...or a driver who wasn't the one on this order
    if (hasDriver) {
      if (order.driver_id === null || Number(order.driver_id) !== Number(driver_id)) {
        return res.status(400).json({
          success: false,
          message: 'Driver is not assigned to this order',
        });
      }
    }

    // insert it - the DB trigger recomputes rating_avg/rating_count for us
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
      // the unique key on (pharmacy, order, target) blocks a second rating - turn that into a clean 409
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
