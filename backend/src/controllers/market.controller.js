// public marketplace controller, no auth. browse/search/filter/sort + paging,
// top 5, live offers, product detail (images + ratings), and the accepted-company list.
// every handler does try/catch -> next(err).

const pool = require('../config/db');
const { unitEffectivePrice, unitListPrice } = require('../utils/pricing');

// positive int or fall back - keeps page/limit sane no matter what comes in the query string
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// whitelist of sort options -> ORDER BY. never interpolate user input into the clause.
const SORT_MAP = {
  newest: 'p.created_at DESC',
  price_asc: 'COALESCE(p.offer_price, p.price) ASC',
  price_desc: 'COALESCE(p.offer_price, p.price) DESC',
  rating: 'p.rating_avg DESC',
  popular: 'p.total_orders DESC',
};

// GET /api/market/products
async function getProducts(req, res, next) {
  try {
    const {
      search,
      company_id,
      type_id,
      category_id,
      min_price,
      max_price,
      sort,
    } = req.query;
    const page = toInt(req.query.page, 1);
    const limit = toInt(req.query.limit, 20);
    const offset = (page - 1) * limit;

    // only show active products from accepted companies whose login is still active -
    // a deactivated company shouldn't have its stuff on the public market
    const conditions = [
      'p.is_active = TRUE',
      "c.registration_status = 'accepted'",
      'EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id AND u.is_active = TRUE)',
    ];
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
    if (min_price !== undefined && min_price !== '') {
      conditions.push('COALESCE(p.offer_price, p.price) >= ?');
      params.push(Number(min_price));
    }
    if (max_price !== undefined && max_price !== '') {
      conditions.push('COALESCE(p.offer_price, p.price) <= ?');
      params.push(Number(max_price));
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const orderBy = SORT_MAP[sort] || SORT_MAP.newest;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM products p
         JOIN companies c ON c.id = p.company_id ${where}`,
      params
    );
    const total = countRows[0].total;

    const [products] = await pool.query(
      `SELECT p.id, p.name, p.price, p.offer_price, p.has_offer, p.offer_ends_at,
              p.rating_avg, p.rating_count, p.total_orders, p.quantity_in_stock,
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

    // flatten the subquery count into a boolean the card component can just read
    for (const p of products) {
      p.has_bulk_discount = Number(p.bulk_discount_count) > 0;
    }

    return res.json({
      success: true,
      data: { products, total, page, limit },
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/market/products/top5
async function getTop5(req, res, next) {
  try {
    // same idea as the v_top5_products view, but we also filter out deactivated /
    // non-accepted companies here so we don't have to touch the view
    const [products] = await pool.query(
      `SELECT p.id, p.name, p.price, p.offer_price, p.has_offer, p.offer_ends_at,
              p.rating_avg, p.rating_count, p.total_orders,
              c.name AS company_name,
              pi.image_url AS main_image
         FROM products p
         JOIN companies c ON c.id = p.company_id
         LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
        WHERE p.is_active = TRUE
          AND c.registration_status = 'accepted'
          AND EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id AND u.is_active = TRUE)
        ORDER BY p.total_orders DESC
        LIMIT 5`
    );
    return res.json({ success: true, data: products });
  } catch (err) {
    return next(err);
  }
}

// GET /api/market/products/offers
async function getOffers(req, res, next) {
  try {
    // mirrors v_active_offers, same deactivated-company filter as top5 above
    const [offers] = await pool.query(
      `SELECT p.id, p.name, p.price, p.offer_price, p.offer_ends_at,
              p.rating_avg,
              c.name AS company_name,
              pi.image_url AS main_image
         FROM products p
         JOIN companies c ON c.id = p.company_id
         LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.sort_order = 0
        WHERE p.is_active = TRUE
          AND p.has_offer = TRUE
          AND p.offer_ends_at > NOW()
          AND c.registration_status = 'accepted'
          AND EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id AND u.is_active = TRUE)
        ORDER BY p.offer_ends_at ASC`
    );
    return res.json({ success: true, data: offers });
  } catch (err) {
    return next(err);
  }
}

// GET /api/market/products/:id
async function getProductById(req, res, next) {
  try {
    const { id } = req.params;

    const [products] = await pool.query(
      `SELECT p.*,
              c.name AS company_name, c.id AS company_id,
              c.description AS company_description, c.address AS company_address,
              pt.name AS product_type_name, pc.name AS category_name
         FROM products p
         JOIN companies c ON c.id = p.company_id
         JOIN product_types pt ON pt.id = p.product_type_id
         JOIN product_categories pc ON pc.id = p.category_id
        WHERE p.id = ? AND p.is_active = TRUE
          AND c.registration_status = 'accepted'
          AND EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id AND u.is_active = TRUE)
        LIMIT 1`,
      [id]
    );
    if (products.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Product not found' });
    }
    const product = products[0];

    const [images] = await pool.query(
      'SELECT id, image_url, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order ASC',
      [id]
    );

    // packaging options, smallest first, each with its offer-aware price + the list price
    // for the struck-through bit. price math comes from utils/pricing so it stays consistent.
    const [unitRows] = await pool.query(
      `SELECT id, unit_name, units_count, discount_percent, final_price, is_default
         FROM product_units
        WHERE product_id = ?
        ORDER BY units_count ASC, id ASC`,
      [id]
    );
    const units = unitRows.map((u) => ({
      ...u,
      effective_price: unitEffectivePrice(product, u),
      list_price: unitListPrice(product, u),
    }));

    const [ratings] = await pool.query(
      `SELECT r.id, r.stars, r.created_at, ph.name AS pharmacy_name
         FROM ratings r
         JOIN pharmacies ph ON ph.id = r.pharmacy_id
        WHERE r.product_id = ?
        ORDER BY r.created_at DESC
        LIMIT 20`,
      [id]
    );

    return res.json({
      success: true,
      data: { ...product, images, units, ratings },
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/market/companies
async function getCompanies(req, res, next) {
  try {
    const { search } = req.query;

    const conditions = ["registration_status = 'accepted'"];
    const params = [];
    if (search && String(search).trim() !== '') {
      conditions.push('name LIKE ?');
      params.push(`%${String(search).trim()}%`);
    }

    const [companies] = await pool.query(
      `SELECT id, name, logo_url, description, address
         FROM companies
        WHERE ${conditions.join(' AND ')}
        ORDER BY name ASC`,
      params
    );
    return res.json({ success: true, data: companies });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getProducts,
  getTop5,
  getOffers,
  getProductById,
  getCompanies,
};
