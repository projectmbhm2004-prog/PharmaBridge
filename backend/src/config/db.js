// ============================================================
//  Database configuration — MySQL connection pool (mysql2/promise)
// ============================================================
// Creates a single shared connection pool used across the whole
// application. On startup it also runs a small, idempotent migration
// to make sure the email-verification columns exist on the users table.
// ============================================================

const mysql = require('mysql2/promise');

// ------------------------------------------------------------
// Connection pool
// ------------------------------------------------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10, // max 10 connections
  queueLimit: 0,
  timezone: '+00:00', // store / read everything in UTC
  charset: 'utf8mb4_unicode_ci',
});

/**
 * Check whether a column already exists on a given table.
 * Uses INFORMATION_SCHEMA so it works without throwing.
 *
 * @param {string} table
 * @param {string} column
 * @returns {Promise<boolean>}
 */
async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

/**
 * Check whether a table already exists in the current database.
 *
 * @param {string} table
 * @returns {Promise<boolean>}
 */
async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

/**
 * Return metadata for a single column, or null when it does not exist.
 *
 * @param {string} table
 * @param {string} column
 * @returns {Promise<{type: string, nullable: 'YES'|'NO'}|null>}
 */
async function columnInfo(table, column) {
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE AS type, IS_NULLABLE AS nullable
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length ? rows[0] : null;
}

/**
 * Return the column names of an index, ordered by their position in the index.
 * Empty array when the index does not exist.
 *
 * @param {string} table
 * @param {string} indexName
 * @returns {Promise<string[]>}
 */
async function indexColumns(table, indexName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      ORDER BY SEQ_IN_INDEX`,
    [table, indexName]
  );
  return rows.map((r) => r.COLUMN_NAME);
}

/**
 * Idempotent startup migration:
 *  - add users.email_verified (BOOLEAN DEFAULT FALSE) if missing
 *  - add users.email_verification_token (VARCHAR 255 NULL) if missing
 *  - mark every existing admin as email_verified = TRUE
 *  - create product_units (tiered packaging) table if missing
 *  - backfill one default "Single" unit for every product that has none
 *  - add cart_items.product_unit_id / order_items.product_unit_id if missing
 *
 * Safe to run on every boot.
 */
async function runStartupMigration() {
  try {
    if (!(await columnExists('users', 'email_verified'))) {
      await pool.query(
        `ALTER TABLE users
           ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE`
      );
      console.log('[db] migration: added users.email_verified');
    }

    if (!(await columnExists('users', 'email_verification_token'))) {
      await pool.query(
        `ALTER TABLE users
           ADD COLUMN email_verification_token VARCHAR(255) NULL`
      );
      console.log('[db] migration: added users.email_verification_token');
    }

    // Admins never need to verify their email.
    await pool.query(
      `UPDATE users
          SET email_verified = TRUE
        WHERE role = 'admin'`
    );

    // --------------------------------------------------------
    // Tiered packaging / units
    // --------------------------------------------------------
    // product_units holds the sellable packaging options for a product
    // (Single, Box (10), Carton (24), ...). final_price, when set, overrides
    // the calculated base_price * units_count * (1 - discount_percent/100).
    if (!(await tableExists('product_units'))) {
      await pool.query(
        `CREATE TABLE product_units (
           id               BIGINT        NOT NULL AUTO_INCREMENT,
           product_id       BIGINT        NOT NULL,
           unit_name        VARCHAR(100)  NOT NULL,
           units_count      INT           NOT NULL DEFAULT 1,
           discount_percent DECIMAL(5,2)  NOT NULL DEFAULT 0,
           final_price      DECIMAL(10,2) NULL,
           is_default       BOOLEAN       NOT NULL DEFAULT FALSE,
           created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
           updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           PRIMARY KEY (id),
           UNIQUE KEY uq_product_unit_name (product_id, unit_name),
           KEY idx_product_units_product (product_id),
           FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );
      console.log('[db] migration: created product_units');
    }

    // Backfill: every product that has no packaging row gets one default
    // "Single" unit (units_count = 1, no discount, no override) so its price
    // continues to resolve to the current base price.
    const [backfill] = await pool.query(
      `INSERT INTO product_units
         (product_id, unit_name, units_count, discount_percent, final_price, is_default)
       SELECT p.id, 'Single', 1, 0, NULL, TRUE
         FROM products p
        WHERE NOT EXISTS (
          SELECT 1 FROM product_units pu WHERE pu.product_id = p.id
        )`
    );
    if (backfill.affectedRows > 0) {
      console.log(
        `[db] migration: backfilled ${backfill.affectedRows} default product_units`
      );
    }

    // cart_items.product_unit_id — which packaging the pharmacy selected.
    if (!(await columnExists('cart_items', 'product_unit_id'))) {
      await pool.query(
        `ALTER TABLE cart_items
           ADD COLUMN product_unit_id BIGINT NULL,
           ADD FOREIGN KEY (product_unit_id) REFERENCES product_units(id) ON DELETE SET NULL`
      );
      console.log('[db] migration: added cart_items.product_unit_id');
    }

    // order_items.product_unit_id — packaging captured at order time (so the
    // accept-time stock decrement and order display know base units / labels).
    if (!(await columnExists('order_items', 'product_unit_id'))) {
      await pool.query(
        `ALTER TABLE order_items
           ADD COLUMN product_unit_id BIGINT NULL,
           ADD FOREIGN KEY (product_unit_id) REFERENCES product_units(id) ON DELETE SET NULL`
      );
      console.log('[db] migration: added order_items.product_unit_id');
    }

    // --------------------------------------------------------
    // Cart uniqueness now keys on packaging too
    // --------------------------------------------------------
    // The same product may sit in a cart more than once with DIFFERENT
    // packaging, while the SAME product + SAME packaging still merges into one
    // line. So widen uq_cart_item from (pharmacy_id, product_id) to
    // (pharmacy_id, product_id, product_unit_id).
    //
    // MySQL treats NULLs as distinct in a unique index, so multiple NULL
    // product_unit_id rows would NOT merge. To keep the merge behaviour correct
    // we first backfill any NULL product_unit_id with the product's default
    // packaging (is_default, else smallest units_count) before widening the key.
    const cartKeyCols = await indexColumns('cart_items', 'uq_cart_item');
    if (cartKeyCols.length > 0 && !cartKeyCols.includes('product_unit_id')) {
      const [filled] = await pool.query(
        `UPDATE cart_items ci
            SET ci.product_unit_id = (
              SELECT pu.id FROM product_units pu
               WHERE pu.product_id = ci.product_id
               ORDER BY pu.is_default DESC, pu.units_count ASC, pu.id ASC
               LIMIT 1
            )
          WHERE ci.product_unit_id IS NULL`
      );
      if (filled.affectedRows > 0) {
        console.log(
          `[db] migration: backfilled product_unit_id on ${filled.affectedRows} cart rows`
        );
      }
      // Drop + re-add in one statement so there is never a window without the
      // index backing the pharmacy_id foreign key (pharmacy_id stays leftmost).
      await pool.query(
        `ALTER TABLE cart_items
           DROP INDEX uq_cart_item,
           ADD UNIQUE KEY uq_cart_item (pharmacy_id, product_id, product_unit_id)`
      );
      console.log(
        '[db] migration: widened uq_cart_item to (pharmacy_id, product_id, product_unit_id)'
      );
    }

    // --------------------------------------------------------
    // Fix trg_update_product_total_orders to net out rejections
    // --------------------------------------------------------
    // The original trigger added the full quantity_ordered to products.
    // total_orders on accept. With accept-time partial rejection a company can
    // reject part of an item, so total_orders must increment by
    // (quantity_ordered - quantity_rejected) instead. Recreate the trigger with
    // the corrected formula. Idempotent: only rebuild when the live trigger body
    // does not already reference quantity_rejected. (A CREATE TRIGGER with a
    // BEGIN..END body is a single statement to the server — no DELIMITER needed
    // over the wire, and multipleStatements stays off.)
    const [trgRows] = await pool.query(
      `SELECT ACTION_STATEMENT
         FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = DATABASE()
          AND TRIGGER_NAME = 'trg_update_product_total_orders'`
    );
    const trgBody = trgRows.length ? String(trgRows[0].ACTION_STATEMENT) : '';
    if (!trgRows.length || !trgBody.includes('quantity_rejected')) {
      await pool.query('DROP TRIGGER IF EXISTS trg_update_product_total_orders');
      await pool.query(
        `CREATE TRIGGER trg_update_product_total_orders
         AFTER UPDATE ON orders
         FOR EACH ROW
         BEGIN
           IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
             UPDATE products p
             JOIN order_items oi ON oi.product_id = p.id
             SET p.total_orders = p.total_orders + (oi.quantity_ordered - oi.quantity_rejected)
             WHERE oi.order_id = NEW.id;
           END IF;
         END`
      );
      console.log(
        '[db] migration: recreated trg_update_product_total_orders (net of rejections)'
      );
    }

    // --------------------------------------------------------
    // Required public profile fields: description + address
    // --------------------------------------------------------
    // Every company / pharmacy / driver must carry a publicly displayed
    // description (TEXT NOT NULL) and address (VARCHAR(255) NOT NULL).
    // companies/pharmacies already have a nullable TEXT address; drivers had
    // none. Existing rows are backfilled with 'N/A' BEFORE the NOT NULL
    // constraint is applied so the migration is safe on a populated DB.
    for (const tbl of ['companies', 'pharmacies', 'drivers']) {
      // description — TEXT NOT NULL
      if (!(await columnExists(tbl, 'description'))) {
        await pool.query(`ALTER TABLE \`${tbl}\` ADD COLUMN description TEXT NULL`);
        console.log(`[db] migration: added ${tbl}.description`);
      }
      await pool.query(
        `UPDATE \`${tbl}\` SET description = 'N/A'
          WHERE description IS NULL OR description = ''`
      );
      const descInfo = await columnInfo(tbl, 'description');
      if (descInfo && descInfo.nullable === 'YES') {
        await pool.query(`ALTER TABLE \`${tbl}\` MODIFY COLUMN description TEXT NOT NULL`);
        console.log(`[db] migration: set ${tbl}.description NOT NULL`);
      }

      // address — VARCHAR(255) NOT NULL
      if (!(await columnExists(tbl, 'address'))) {
        await pool.query(`ALTER TABLE \`${tbl}\` ADD COLUMN address VARCHAR(255) NULL`);
        console.log(`[db] migration: added ${tbl}.address`);
      }
      await pool.query(
        `UPDATE \`${tbl}\` SET address = 'N/A'
          WHERE address IS NULL OR address = ''`
      );
      const addrInfo = await columnInfo(tbl, 'address');
      if (addrInfo && (addrInfo.nullable === 'YES' || !/^varchar/i.test(addrInfo.type))) {
        await pool.query(`ALTER TABLE \`${tbl}\` MODIFY COLUMN address VARCHAR(255) NOT NULL`);
        console.log(`[db] migration: set ${tbl}.address VARCHAR(255) NOT NULL`);
      }
    }

    console.log('[db] startup migration complete');
  } catch (err) {
    // Don't crash the whole process on a migration hiccup, but make it loud.
    console.error('[db] startup migration failed:', err.message);
  }
}

/**
 * Verify the pool can actually reach the database and then run the
 * startup migration. Called once from app.js during boot.
 *
 * @returns {Promise<void>}
 */
async function initDb() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('[db] connected to MySQL');
    await runStartupMigration();
  } catch (err) {
    console.error('[db] could not connect to MySQL:', err.message);
    throw err;
  }
}

// Export the pool itself (per spec). initDb is attached as a helper —
// note: do NOT reassign `pool.pool`, that is an internal mysql2 property.
module.exports = pool;
module.exports.initDb = initDb;
