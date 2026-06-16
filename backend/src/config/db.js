// one shared mysql2 pool for the whole app. on boot we also run a tiny idempotent
// migration so the schema lines up even on older DBs that predate some columns.

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10, // 10 felt like plenty for our load, bump if we start queueing
  queueLimit: 0,
  timezone: '+00:00', // everything in/out is UTC, we format in the frontend
  charset: 'utf8mb4_unicode_ci',
});

// does this column exist? goes through INFORMATION_SCHEMA so it never throws if it's missing
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

// same idea, for whole tables
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

// returns {type, nullable} for a column, or null if it isn't there - used by the migration to decide what to ALTER
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

// the columns making up an index, in order. empty array if the index doesn't exist
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

// startup migration - all of this is safe to run on every boot, each step checks
// before it touches anything. grew over time as we added features, hence the length.
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

    // admins skip email verification, just flip them all on
    await pool.query(
      `UPDATE users
          SET email_verified = TRUE
        WHERE role = 'admin'`
    );

    // tiered packaging table - the Single / Box / Carton options per product.
    // final_price overrides the calc when it's set (see utils/pricing.js).
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

    // any product with no packaging row gets a default "Single" so its price still
    // resolves to the plain base price - otherwise old products would price as 0
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

    // remembers which packaging the pharmacy picked in the cart
    if (!(await columnExists('cart_items', 'product_unit_id'))) {
      await pool.query(
        `ALTER TABLE cart_items
           ADD COLUMN product_unit_id BIGINT NULL,
           ADD FOREIGN KEY (product_unit_id) REFERENCES product_units(id) ON DELETE SET NULL`
      );
      console.log('[db] migration: added cart_items.product_unit_id');
    }

    // freeze the packaging onto the order line at order time, so stock decrement and the
    // order display still know the base-unit count / label even if the unit changes later
    if (!(await columnExists('order_items', 'product_unit_id'))) {
      await pool.query(
        `ALTER TABLE order_items
           ADD COLUMN product_unit_id BIGINT NULL,
           ADD FOREIGN KEY (product_unit_id) REFERENCES product_units(id) ON DELETE SET NULL`
      );
      console.log('[db] migration: added order_items.product_unit_id');
    }

    // widening the cart unique key to include packaging. the same product can sit in the
    // cart twice with different packaging, but same product + same packaging should still
    // merge into one line. catch: MySQL treats NULLs as distinct in a unique index, so NULL
    // unit rows wouldn't merge - so backfill NULLs with the product's default unit first,
    // THEN widen the key.
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
      // drop + re-add in one ALTER so there's never a moment where pharmacy_id has no index
      // backing its foreign key (pharmacy_id stays the leftmost column)
      await pool.query(
        `ALTER TABLE cart_items
           DROP INDEX uq_cart_item,
           ADD UNIQUE KEY uq_cart_item (pharmacy_id, product_id, product_unit_id)`
      );
      console.log(
        '[db] migration: widened uq_cart_item to (pharmacy_id, product_id, product_unit_id)'
      );
    }

    // the old trigger added the full quantity_ordered to total_orders on accept. once we
    // allowed partial rejection at accept time that was wrong - it should add
    // (quantity_ordered - quantity_rejected). rebuild it, but only if the live trigger body
    // doesn't already mention quantity_rejected so we don't churn it every boot.
    // (a CREATE TRIGGER with a BEGIN..END body is one statement over the wire - no DELIMITER
    // needed and multipleStatements stays off.)
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

    // every company / pharmacy / driver needs a public description + address that aren't null.
    // drivers had neither column. backfill existing rows with 'N/A' BEFORE adding NOT NULL,
    // otherwise the constraint blows up on a populated DB.
    for (const tbl of ['companies', 'pharmacies', 'drivers']) {
      // description first
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

      // then address
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
    // don't take the whole process down over a migration hiccup, but make it loud in the logs
    console.error('[db] startup migration failed:', err.message);
  }
}

// ping once to make sure we can actually reach MySQL, then run the migration. called from app.js on boot.
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

// export the pool directly. initDb hangs off it as a helper -
// don't reassign pool.pool, that's an internal mysql2 thing
module.exports = pool;
module.exports.initDb = initDb;
