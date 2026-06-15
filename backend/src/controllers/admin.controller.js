// ============================================================
//  Admin controller
// ============================================================
//  registration review, manual company/pharmacy creation,
//  orders listing, marketplace view, and category management.
//  All handlers: try/catch -> next(err); multi-table writes use
//  transactions; email is non-blocking; socket emit is non-fatal.
// ============================================================

const bcrypt = require('bcrypt');

const pool = require('../config/db');
const { sendEmail } = require('../services/email.service');
const { emitToUser } = require('../services/socket.service');

const BCRYPT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/**
 * Validate password strength (same rules as auth/register).
 * @param {string} password
 * @returns {string|null} error message or null when valid
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (!/[!@#$%^&*]/.test(password)) {
    return 'Password must contain at least one special character (!@#$%^&*)';
  }
  return null;
}

/** Fire-and-forget email; never throws into the request flow. */
function sendEmailSafe(opts) {
  sendEmail(opts).catch((err) =>
    console.error('[admin] email failed:', err.message)
  );
}

/** Parse a positive integer query param with a fallback. */
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// ------------------------------------------------------------
// GET /api/admin/registrations
// ------------------------------------------------------------
async function getRegistrations(req, res, next) {
  try {
    const type = req.query.type || 'all';
    const status = req.query.status || 'all';

    const wantCompanies = type === 'company' || type === 'all';
    const wantPharmacies = type === 'pharmacy' || type === 'all';

    let companies = [];
    let pharmacies = [];

    if (wantCompanies) {
      let sql = `
        SELECT c.*, u.email, u.is_active, u.created_at AS user_created_at, 'company' AS entity_type
          FROM companies c
          JOIN users u ON u.id = c.user_id
         WHERE u.email_verified = 1`;
      const params = [];
      if (status !== 'all') {
        sql += ' AND c.registration_status = ?';
        params.push(status);
      }
      sql += ' ORDER BY c.registered_at DESC';
      const [rows] = await pool.query(sql, params);
      companies = rows;
    }

    if (wantPharmacies) {
      let sql = `
        SELECT p.*, u.email, u.is_active, u.created_at AS user_created_at, 'pharmacy' AS entity_type
          FROM pharmacies p
          JOIN users u ON u.id = p.user_id
         WHERE u.email_verified = 1`;
      const params = [];
      if (status !== 'all') {
        sql += ' AND p.registration_status = ?';
        params.push(status);
      }
      sql += ' ORDER BY p.registered_at DESC';
      const [rows] = await pool.query(sql, params);
      pharmacies = rows;
    }

    return res.json({ success: true, data: { companies, pharmacies } });
  } catch (err) {
    return next(err);
  }
}

// ------------------------------------------------------------
// PATCH /api/admin/registrations/:id
// ------------------------------------------------------------
async function reviewRegistration(req, res, next) {
  let conn;
  try {
    const { id } = req.params;
    const { type, action, rejection_reason } = req.body || {};

    // 1 + 2. validate inputs
    if (type !== 'company' && type !== 'pharmacy') {
      return res
        .status(400)
        .json({ success: false, message: 'type must be company or pharmacy' });
    }
    if (action !== 'accept' && action !== 'reject') {
      return res
        .status(400)
        .json({ success: false, message: 'action must be accept or reject' });
    }

    const table = type === 'company' ? 'companies' : 'pharmacies';

    // 4. find record (join users for email)
    const [rows] = await pool.query(
      `SELECT t.id, t.user_id, t.name, u.email
         FROM ${table} t
         JOIN users u ON u.id = t.user_id
        WHERE t.id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Registration not found' });
    }
    const record = rows[0];

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    const isActive = action === 'accept';
    const reason = action === 'reject' ? rejection_reason || null : null;

    // 5. transaction
    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query(
      `UPDATE ${table}
          SET registration_status = ?, rejection_reason = ?
        WHERE id = ?`,
      [newStatus, reason, id]
    );
    await conn.query('UPDATE users SET is_active = ? WHERE id = ?', [
      isActive,
      record.user_id,
    ]);

    // 9. notification (inside tx so it's consistent with the status change)
    const notifType =
      action === 'accept' ? 'registration_accepted' : 'registration_rejected';
    const notifTitle =
      action === 'accept' ? 'Registration approved' : 'Registration declined';
    const notifBody =
      action === 'accept'
        ? 'Your account has been approved. You can now log in.'
        : `Your registration has been declined.${reason ? ' Reason: ' + reason : ''}`;
    await conn.query(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES (?, ?, ?, ?)`,
      [record.user_id, notifType, notifTitle, notifBody]
    );

    await conn.commit();
    conn.release();
    conn = null;

    // 7. email (non-blocking)
    if (action === 'accept') {
      const clientUrl =
        req.headers.origin || process.env.CLIENT_URL || 'http://localhost:5173';
      const accountLabel = type === 'company' ? 'company' : 'pharmacy';
      sendEmailSafe({
        to: record.email,
        subject: 'Your Account Has Been Approved — PharmaBridge',
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
            <h2 style="color:#166534">Account Approved</h2>
            <p>Great news! Your ${accountLabel} account on PharmaBridge has been approved
            by our admin team. You can now log in and start using the platform.</p>
            <p style="margin-top:24px">
              <a href='${clientUrl}/login' style='background:#166534;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;'>Login Now</a>
            </p>
          </div>`,
      });
    } else {
      sendEmailSafe({
        to: record.email,
        subject: 'Your registration was declined — PharmaBridge',
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
            <h2 style="color:#dc2626">Registration Declined</h2>
            <p>Your registration has been declined.</p>
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          </div>`,
      });
    }

    // 8. socket (non-fatal)
    try {
      emitToUser(req.app, record.user_id, 'registration_update', {
        action,
        reason,
      });
    } catch (sockErr) {
      console.error('[admin] socket emit failed:', sockErr.message);
    }

    return res.json({
      success: true,
      message: action === 'accept' ? 'Registration accepted.' : 'Registration rejected.',
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.error('[admin] rollback failed:', rbErr.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// ------------------------------------------------------------
// DELETE /api/admin/registrations/:id
// ------------------------------------------------------------
async function deleteRegistration(req, res, next) {
  try {
    const { id } = req.params;
    const { type } = req.query;

    // 1. validate type
    if (type !== 'company' && type !== 'pharmacy') {
      return res
        .status(400)
        .json({ success: false, message: 'type must be company or pharmacy' });
    }

    const table = type === 'company' ? 'companies' : 'pharmacies';

    // 2. find record + its user_id
    const [rows] = await pool.query(
      `SELECT user_id FROM ${table} WHERE id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Registration not found' });
    }

    // 3. delete the user (CASCADE removes the company/pharmacy row)
    await pool.query('DELETE FROM users WHERE id = ?', [rows[0].user_id]);

    return res.json({ success: true, message: 'Registration deleted.' });
  } catch (err) {
    return next(err);
  }
}

// ------------------------------------------------------------
// PATCH /api/admin/companies/:id/toggle-status
// PATCH /api/admin/pharmacies/:id/toggle-status
// ------------------------------------------------------------
async function toggleAccountStatus(req, type, id, res, next) {
  try {
    if (type !== 'company' && type !== 'pharmacy') {
      return res
        .status(400)
        .json({ success: false, message: 'type must be company or pharmacy' });
    }

    const table = type === 'company' ? 'companies' : 'pharmacies';

    // find the record + its user_id (join users for the notification email)
    const [rows] = await pool.query(
      `SELECT t.user_id, u.email
         FROM ${table} t
         JOIN users u ON u.id = t.user_id
        WHERE t.id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Account not found' });
    }
    const userId = rows[0].user_id;
    const email = rows[0].email;

    // flip is_active
    await pool.query(
      'UPDATE users SET is_active = NOT is_active WHERE id = ?',
      [userId]
    );

    const [updated] = await pool.query(
      'SELECT is_active FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const isActive = !!updated[0].is_active;

    // notify the user of the new status (email + in-app + socket; all non-fatal)
    const notifType = isActive ? 'account_activated' : 'account_deactivated';
    const notifTitle = isActive ? 'Account Reactivated' : 'Account Deactivated';
    const notifBody = isActive
      ? 'Your account has been reactivated by the admin'
      : 'Your account has been deactivated by the admin';

    try {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES (?, ?, ?, ?)`,
        [userId, notifType, notifTitle, notifBody]
      );
    } catch (notifErr) {
      console.error('[admin] notification insert failed:', notifErr.message);
    }

    if (isActive) {
      sendEmailSafe({
        to: email,
        subject: 'Account Reactivated — PharmaBridge',
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
            <h2 style="color:#166534">Account Reactivated</h2>
            <p>Your account has been reactivated. You can now log in again.</p>
          </div>`,
      });
    } else {
      sendEmailSafe({
        to: email,
        subject: 'Account Deactivated — PharmaBridge',
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
            <h2 style="color:#dc2626">Account Deactivated</h2>
            <p>Your account has been temporarily deactivated by the platform admin.
            Please contact support if you believe this is an error.</p>
          </div>`,
      });
    }

    try {
      emitToUser(
        req.app,
        userId,
        isActive ? 'account_activated' : 'account_deactivated',
        {
          message: isActive
            ? 'Your account has been reactivated'
            : 'Your account has been deactivated',
        }
      );
    } catch (sockErr) {
      console.error('[admin] socket emit failed:', sockErr.message);
    }

    // When a COMPANY is deactivated, auto-reject its still-pending orders.
    // A deactivated company can no longer log in to accept/reject them (the
    // auth middleware now blocks inactive accounts), so without this those
    // orders would sit in 'pending' forever and the pharmacies would never
    // know. NOTE: order_status_log.status has no 'rejected' value, so we don't
    // write a status-log row here — the order's rejection_reason records why.
    let autoRejected = 0;
    if (type === 'company' && !isActive) {
      let conn;
      try {
        const [pending] = await pool.query(
          `SELECT o.id, ph.user_id AS pharmacy_user_id
             FROM orders o
             JOIN pharmacies ph ON ph.id = o.pharmacy_id
            WHERE o.company_id = ? AND o.status = 'pending'`,
          [id]
        );

        if (pending.length > 0) {
          conn = await pool.getConnection();
          await conn.beginTransaction();
          for (const ord of pending) {
            await conn.query(
              `UPDATE orders
                  SET status = 'rejected',
                      rejection_reason = 'Company account deactivated'
                WHERE id = ? AND status = 'pending'`,
              [ord.id]
            );

            // Stock was reserved at checkout, so auto-rejecting each pending
            // order must return its base units to the pool. quantity_ordered is
            // PACKAGES; stock is BASE units, so restore quantity_ordered *
            // units_count per line. Lock each product row FOR UPDATE first.
            const [restoreItems] = await conn.query(
              `SELECT oi.product_id, oi.quantity_ordered,
                      COALESCE(pu.units_count, 1) AS units_count
                 FROM order_items oi
                 LEFT JOIN product_units pu ON pu.id = oi.product_unit_id
                WHERE oi.order_id = ?`,
              [ord.id]
            );
            for (const item of restoreItems) {
              const baseUnits =
                item.quantity_ordered * (Number(item.units_count) || 1);
              await conn.query(
                'SELECT quantity_in_stock FROM products WHERE id = ? FOR UPDATE',
                [item.product_id]
              );
              await conn.query(
                `UPDATE products SET quantity_in_stock = quantity_in_stock + ?
                  WHERE id = ? AND company_id = ?`,
                [baseUnits, item.product_id, id]
              );
            }
          }
          await conn.commit();
          conn.release();
          conn = null;
          autoRejected = pending.length;

          // notify each affected pharmacy (non-blocking)
          for (const ord of pending) {
            if (!ord.pharmacy_user_id) continue;
            const body = `Your order #${ord.id} was automatically rejected because the company is no longer available.`;
            try {
              await pool.query(
                `INSERT INTO notifications (user_id, type, title, body, related_order_id)
                 VALUES (?, 'order_rejected', ?, ?, ?)`,
                [ord.pharmacy_user_id, 'Order rejected', body, ord.id]
              );
              emitToUser(req.app, ord.pharmacy_user_id, 'order_rejected', {
                order_id: ord.id,
                message: body,
              });
            } catch (nErr) {
              console.error('[admin] auto-reject notify failed:', nErr.message);
            }
          }
        }
      } catch (arErr) {
        if (conn) {
          try {
            await conn.rollback();
          } catch (rbErr) {
            console.error('[admin] auto-reject rollback failed:', rbErr.message);
          }
          conn.release();
        }
        // Don't fail the deactivation itself if the cascade hits a problem.
        console.error('[admin] auto-reject pending orders failed:', arErr.message);
      }
    }

    return res.json({
      success: true,
      data: { is_active: isActive, auto_rejected_orders: autoRejected },
    });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/admin/companies/:id/toggle-status
function toggleCompanyStatus(req, res, next) {
  return toggleAccountStatus(req, 'company', req.params.id, res, next);
}

// PATCH /api/admin/pharmacies/:id/toggle-status
function togglePharmacyStatus(req, res, next) {
  return toggleAccountStatus(req, 'pharmacy', req.params.id, res, next);
}

// ------------------------------------------------------------
// DELETE /api/admin/companies/:id
// DELETE /api/admin/pharmacies/:id
// Permanently delete an account, but only when it has no order
// history — otherwise the admin must deactivate it instead.
// ------------------------------------------------------------
async function deleteCompanyOrPharmacy(type, id, res, next) {
  try {
    if (type !== 'company' && type !== 'pharmacy') {
      return res
        .status(400)
        .json({ success: false, message: 'type must be company or pharmacy' });
    }

    const table = type === 'company' ? 'companies' : 'pharmacies';
    const orderColumn = type === 'company' ? 'company_id' : 'pharmacy_id';

    // find the record + its user_id
    const [rows] = await pool.query(
      `SELECT user_id FROM ${table} WHERE id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Account not found' });
    }
    const userId = rows[0].user_id;

    // block deletion when the account has any order history
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM orders WHERE ${orderColumn} = ?`,
      [id]
    );
    if (countRows[0].cnt > 0) {
      return res.status(400).json({
        success: false,
        message:
          'Cannot delete: this account has order history. Deactivate it instead.',
      });
    }

    // delete the user (CASCADE removes company/pharmacy row, products, drivers, etc.)
    if (type === 'company') {
      // A company's private categories (product_categories.company_id = this
      // company) must be removed too — the FK is ON DELETE SET NULL, so they'd
      // otherwise survive as NULL (general) categories visible to every
      // company, leaking a private category into the global pool.
      //
      // We capture their ids first, then delete the company (via its user).
      // That cascade removes this company's products, so by the time we delete
      // the captured categories nothing references them (products.category_id
      // is ON DELETE RESTRICT, which would block a delete-before-cascade).
      const [cats] = await pool.query(
        'SELECT id FROM product_categories WHERE company_id = ?',
        [id]
      );
      const catIds = cats.map((c) => c.id);

      let conn;
      try {
        conn = await pool.getConnection();
        await conn.beginTransaction();
        await conn.query('DELETE FROM users WHERE id = ?', [userId]);
        if (catIds.length > 0) {
          await conn.query(
            'DELETE FROM product_categories WHERE id IN (?)',
            [catIds]
          );
        }
        await conn.commit();
        conn.release();
        conn = null;
      } catch (txErr) {
        if (conn) {
          try {
            await conn.rollback();
          } catch (rbErr) {
            console.error('[admin] delete-company rollback failed:', rbErr.message);
          }
          conn.release();
        }
        throw txErr;
      }
    } else {
      await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    }

    return res.json({
      success: true,
      message: 'Account permanently deleted.',
    });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/admin/companies/:id
function deleteCompany(req, res, next) {
  return deleteCompanyOrPharmacy('company', req.params.id, res, next);
}

// DELETE /api/admin/pharmacies/:id
function deletePharmacy(req, res, next) {
  return deleteCompanyOrPharmacy('pharmacy', req.params.id, res, next);
}

// ------------------------------------------------------------
// Shared helper for manual account creation (company / pharmacy)
// ------------------------------------------------------------
async function createAccount(req, res, next, role) {
  let conn;
  try {
    const { email, password, name, phone, address, description, owner_name } =
      req.body || {};

    // description + address are NOT NULL on these tables. Admin-created accounts
    // don't require them in the form, so fall back to a placeholder the admin
    // can edit later rather than rejecting the request.
    const addressValue =
      typeof address === 'string' && address.trim() ? address.trim() : 'N/A';
    const descriptionValue =
      typeof description === 'string' && description.trim()
        ? description.trim()
        : 'N/A';

    // 1. required fields
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'email, password, and name are required',
      });
    }

    // 2. email format
    if (!EMAIL_REGEX.test(email)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid email format' });
    }

    // 3. email uniqueness
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (existing.length > 0) {
      return res
        .status(409)
        .json({ success: false, message: 'Email is already registered' });
    }

    // 4. password strength
    const pwError = validatePassword(password);
    if (pwError) {
      return res.status(400).json({ success: false, message: pwError });
    }

    // 5. hash
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // 6. transaction (admin-created accounts are active + verified)
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [userResult] = await conn.query(
      `INSERT INTO users
         (email, password_hash, role, is_active, email_verified)
       VALUES (?, ?, ?, TRUE, TRUE)`,
      [email, passwordHash, role]
    );
    const userId = userResult.insertId;

    if (role === 'company') {
      await conn.query(
        `INSERT INTO companies (user_id, name, phone, address, description, registration_status)
         VALUES (?, ?, ?, ?, ?, 'accepted')`,
        [userId, name, phone || null, addressValue, descriptionValue]
      );
    } else {
      await conn.query(
        `INSERT INTO pharmacies (user_id, name, phone, address, description, owner_name, registration_status)
         VALUES (?, ?, ?, ?, ?, ?, 'accepted')`,
        [userId, name, phone || null, addressValue, descriptionValue, owner_name || null]
      );
    }

    await conn.commit();
    conn.release();
    conn = null;

    return res.status(201).json({
      success: true,
      message:
        role === 'company'
          ? 'Company created successfully.'
          : 'Pharmacy created successfully.',
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.error('[admin] rollback failed:', rbErr.message);
      }
      conn.release();
    }
    return next(err);
  }
}

// POST /api/admin/companies
function createCompany(req, res, next) {
  return createAccount(req, res, next, 'company');
}

// POST /api/admin/pharmacies
function createPharmacy(req, res, next) {
  return createAccount(req, res, next, 'pharmacy');
}

// ------------------------------------------------------------
// Shared helper for editing the public profile fields
// (description + address) of a company / pharmacy.
// Both columns are NOT NULL, so each must be a non-empty string.
// ------------------------------------------------------------
async function updateProfile(req, res, next, table) {
  try {
    const { id } = req.params;
    const { description, address } = req.body || {};

    const descriptionTrimmed =
      typeof description === 'string' ? description.trim() : '';
    const addressTrimmed = typeof address === 'string' ? address.trim() : '';

    if (!descriptionTrimmed) {
      return res
        .status(400)
        .json({ success: false, message: 'Description is required' });
    }
    if (!addressTrimmed) {
      return res
        .status(400)
        .json({ success: false, message: 'Address is required' });
    }
    if (addressTrimmed.length > 255) {
      return res.status(400).json({
        success: false,
        message: 'Address must be 255 characters or fewer',
      });
    }

    const [result] = await pool.query(
      `UPDATE ${table} SET description = ?, address = ? WHERE id = ?`,
      [descriptionTrimmed, addressTrimmed, id]
    );
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Record not found' });
    }

    return res.json({ success: true, message: 'Profile updated.' });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/admin/companies/:id
function updateCompany(req, res, next) {
  return updateProfile(req, res, next, 'companies');
}

// PATCH /api/admin/pharmacies/:id
function updatePharmacy(req, res, next) {
  return updateProfile(req, res, next, 'pharmacies');
}

// ------------------------------------------------------------
// GET /api/admin/orders
// ------------------------------------------------------------
async function getOrders(req, res, next) {
  try {
    const { status, company_id, pharmacy_id, from, to, search, pharmacy, company } =
      req.query;
    const page = toInt(req.query.page, 1);
    const limit = toInt(req.query.limit, 20);
    const offset = (page - 1) * limit;

    // pharmacy/company name search needs the joins to be present, so the count
    // query joins the same tables as the listing query below.
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }
    if (company_id) {
      conditions.push('o.company_id = ?');
      params.push(company_id);
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
    // Order-ID search (partial match on the numeric id).
    if (search) {
      conditions.push('CAST(o.id AS CHAR) LIKE ?');
      params.push(`%${search}%`);
    }
    if (pharmacy) {
      conditions.push('p.name LIKE ?');
      params.push(`%${pharmacy}%`);
    }
    if (company) {
      conditions.push('c.name LIKE ?');
      params.push(`%${company}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // total count for pagination (same joins as the listing query so the
    // pharmacy/company name filters resolve)
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM orders o
         JOIN pharmacies p ON p.id = o.pharmacy_id
         JOIN companies c ON c.id = o.company_id
        ${where}`,
      params
    );
    const total = countRows[0].total;

    const [orders] = await pool.query(
      `SELECT o.*,
              p.name AS pharmacy_name,
              c.name AS company_name,
              d.full_name AS driver_name
         FROM orders o
         JOIN pharmacies p ON p.id = o.pharmacy_id
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

// ------------------------------------------------------------
// GET /api/admin/drivers
// ------------------------------------------------------------
async function getAllDrivers(req, res, next) {
  try {
    const [drivers] = await pool.query(
      `SELECT d.*, u.email, c.name AS company_name
         FROM drivers d
         JOIN users u ON u.id = d.user_id
         JOIN companies c ON c.id = d.company_id
        WHERE u.email_verified = 1
        ORDER BY d.registered_at DESC`
    );
    return res.json({ success: true, data: drivers });
  } catch (err) {
    return next(err);
  }
}

// ------------------------------------------------------------
// GET /api/admin/market
// ------------------------------------------------------------
async function getMarket(req, res, next) {
  try {
    const { search, company_id, type_id, category_id } = req.query;
    const page = toInt(req.query.page, 1);
    const limit = toInt(req.query.limit, 20);
    const offset = (page - 1) * limit;

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
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    for (const p of products) {
      p.has_bulk_discount = Number(p.bulk_discount_count) > 0;
    }

    return res.json({ success: true, data: { products, total } });
  } catch (err) {
    return next(err);
  }
}

// ------------------------------------------------------------
// GET /api/admin/categories
// ------------------------------------------------------------
async function getCategories(req, res, next) {
  try {
    const [categories] = await pool.query(
      `SELECT pc.*, c.name AS company_name
         FROM product_categories pc
         LEFT JOIN companies c ON c.id = pc.company_id
        ORDER BY pc.created_at DESC`
    );
    return res.json({ success: true, data: categories });
  } catch (err) {
    return next(err);
  }
}

// ------------------------------------------------------------
// POST /api/admin/categories
// ------------------------------------------------------------
async function createCategory(req, res, next) {
  try {
    const { name, description, company_id } = req.body || {};

    // 1. name required
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: 'Category name is required' });
    }

    // 2. if company_id given, verify it exists
    if (company_id) {
      const [companies] = await pool.query(
        'SELECT id FROM companies WHERE id = ? LIMIT 1',
        [company_id]
      );
      if (companies.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: 'Company not found' });
      }
    }

    // 3. insert
    const [result] = await pool.query(
      `INSERT INTO product_categories (name, description, company_id, created_by_admin)
       VALUES (?, ?, ?, TRUE)`,
      [name, description || null, company_id || null]
    );

    return res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    return next(err);
  }
}

// ------------------------------------------------------------
// DELETE /api/admin/categories/:id
// ------------------------------------------------------------
async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;

    // 1. exists?
    const [rows] = await pool.query(
      'SELECT id FROM product_categories WHERE id = ? LIMIT 1',
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Category not found' });
    }

    // 2. in use?
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM products WHERE category_id = ?',
      [id]
    );
    if (countRows[0].cnt > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category that is in use by products',
      });
    }

    // 3. delete
    await pool.query('DELETE FROM product_categories WHERE id = ?', [id]);

    return res.json({ success: true, message: 'Category deleted.' });
  } catch (err) {
    return next(err);
  }
}

// ------------------------------------------------------------
// GET /api/admin/product-types
// ------------------------------------------------------------
async function getProductTypes(req, res, next) {
  try {
    const [types] = await pool.query(
      'SELECT * FROM product_types ORDER BY name ASC'
    );
    return res.json({ success: true, data: types });
  } catch (err) {
    return next(err);
  }
}

// ------------------------------------------------------------
// POST /api/admin/product-types
// ------------------------------------------------------------
async function addProductType(req, res, next) {
  try {
    const { name } = req.body || {};

    // 1. name required
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: 'Product type name is required' });
    }

    // 2. insert
    const [result] = await pool.query(
      'INSERT INTO product_types (name) VALUES (?)',
      [name]
    );

    return res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    return next(err);
  }
}

// ------------------------------------------------------------
// DELETE /api/admin/product-types/:id
// ------------------------------------------------------------
async function deleteProductType(req, res, next) {
  try {
    const { id } = req.params;

    // 1. exists?
    const [rows] = await pool.query(
      'SELECT id FROM product_types WHERE id = ? LIMIT 1',
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Product type not found' });
    }

    // 2. in use?
    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM products WHERE product_type_id = ?',
      [id]
    );
    if (countRows[0].cnt > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete type that is used by products',
      });
    }

    // 3. delete
    await pool.query('DELETE FROM product_types WHERE id = ?', [id]);

    return res.json({ success: true, message: 'Product type deleted.' });
  } catch (err) {
    return next(err);
  }
}

// ============================================================
//  PLATFORM STATS
// ============================================================

// GET /api/admin/stats
// Server-side aggregates for the admin dashboard KPIs. Computed in SQL over the
// whole dataset so the figures are exact (the old client-side reduce ran over a
// capped 1000-row page and counted undelivered orders as debt). total_debt
// sums (total_amount - paid_amount) over delivered orders only, which includes
// the negative balances of manual payment / overpaid orders — matching
// v_pharmacy_debts.SUM(debt_amount).
async function getStats(req, res, next) {
  try {
    const [orderRows] = await pool.query(
      `SELECT
         COUNT(*) AS total_orders,
         COUNT(CASE WHEN status IN ('delivered','partially_delivered') THEN 1 END) AS completed_orders,
         COALESCE(SUM(CASE WHEN status IN ('delivered','partially_delivered') THEN total_amount END), 0) AS total_revenue,
         COALESCE(SUM(CASE WHEN status IN ('delivered','partially_delivered') THEN (total_amount - paid_amount) END), 0) AS total_debt,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_orders
       FROM orders`
    );
    const [companyRows] = await pool.query(
      `SELECT COUNT(*) AS total_companies
         FROM companies WHERE registration_status = 'accepted'`
    );
    const [pharmacyRows] = await pool.query(
      `SELECT COUNT(*) AS total_pharmacies
         FROM pharmacies WHERE registration_status = 'accepted'`
    );

    const o = orderRows[0];
    return res.json({
      success: true,
      data: {
        total_orders: Number(o.total_orders) || 0,
        completed_orders: Number(o.completed_orders) || 0,
        total_revenue: Number(o.total_revenue) || 0,
        total_debt: Number(o.total_debt) || 0,
        pending_orders: Number(o.pending_orders) || 0,
        total_companies: Number(companyRows[0].total_companies) || 0,
        total_pharmacies: Number(pharmacyRows[0].total_pharmacies) || 0,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/admin/top-debtors
// The five pharmacies with the largest outstanding balance. debt_amount nets
// out credit/overpayment lines, so we sum per pharmacy and keep only those
// still in the red (HAVING > 0) — a pharmacy that has settled up shouldn't
// surface on a receivables watchlist.
async function getTopDebtors(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT
         p.name AS pharmacy_name,
         p.id AS pharmacy_id,
         COALESCE(SUM(fr.debt_amount), 0) AS total_debt
       FROM financial_records fr
       JOIN pharmacies p ON p.id = fr.pharmacy_id
       GROUP BY fr.pharmacy_id, p.name
       HAVING total_debt > 0
       ORDER BY total_debt DESC
       LIMIT 5`
    );

    const debtors = rows.map((r) => ({
      pharmacy_id: r.pharmacy_id,
      pharmacy_name: r.pharmacy_name,
      total_debt: Number(r.total_debt) || 0,
    }));

    return res.json({ success: true, data: debtors });
  } catch (err) {
    return next(err);
  }
}

// GET /api/admin/top-companies
// The five suppliers ranked by cash actually collected (paid_amount), not
// merely billed — revenue recognised is money in the door. total_orders is the
// count of settled order lines backing that revenue.
async function getTopCompanies(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT
         c.name AS company_name,
         c.id AS company_id,
         COALESCE(SUM(fr.paid_amount), 0) AS total_revenue,
         COUNT(fr.order_id) AS total_orders
       FROM financial_records fr
       JOIN companies c ON c.id = fr.company_id
       GROUP BY fr.company_id, c.name
       ORDER BY total_revenue DESC
       LIMIT 5`
    );

    const companies = rows.map((r) => ({
      company_id: r.company_id,
      company_name: r.company_name,
      total_revenue: Number(r.total_revenue) || 0,
      total_orders: Number(r.total_orders) || 0,
    }));

    return res.json({ success: true, data: companies });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
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
};
