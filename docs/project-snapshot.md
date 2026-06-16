# PharmaBridge — Project Snapshot

> Factual snapshot generated from a full read of the source tree under `pharma-platform/`.
> Everything below reflects code that actually exists in the repository. The live project root is
> `pharma-platform/` (the outer `PharmaBridge (B2B)/` folder also holds `PRD_updated.md`,
> `schema.sql`, `schema_final.sql`, and `PROJECT_DOCUMENTATION.md`).
>
> The database section is sourced from `schema_final.sql` (the consolidated/current schema), which
> the comment header states "folds in every change that previously lived only in the app's startup
> migration (`backend/src/config/db.js`)".

---

## 1. Tech Stack

### Backend (`backend/package.json`)
- **name:** `pharma-platform-backend`, version `1.0.0`, `"type": "commonjs"`, entry `src/app.js`
- **Scripts:** `dev` (`nodemon src/app.js`), `start` (`node src/app.js`), `kill` (`npx kill-port 5000`), `fresh`, `predev` (kills port 5000 first)

Dependencies:
- `bcrypt` ^6.0.0
- `cloudinary` ^2.10.0
- `cors` ^2.8.6
- `dotenv` ^17.4.2
- `express` ^5.2.1
- `jsonwebtoken` ^9.0.3
- `multer` ^2.1.1
- `mysql2` ^3.22.4
- `nodemailer` ^8.0.10
- `resend` ^6.12.4
- `socket.io` ^4.8.3

devDependencies:
- `kill-port` ^2.0.1
- `nodemon` ^3.1.14

> Note: both `nodemailer` and `resend` are installed. The actual email sender
> (`services/email.service.js`) uses **Resend**; `config/nodemailer.js` builds a Gmail SMTP
> transporter that is **not imported anywhere** (see §14).

### Frontend (`frontend/package.json`)
- **name:** `frontend`, `"type": "module"`, private
- **Scripts:** `dev` (`vite`), `build` (`vite build`), `lint` (`eslint .`), `preview` (`vite preview`)

Dependencies:
- `@tailwindcss/vite` ^4.3.0
- `axios` ^1.17.0
- `class-variance-authority` ^0.7.1
- `clsx` ^2.1.1
- `date-fns` ^4.4.0
- `framer-motion` ^12.40.0
- `lucide-react` ^1.17.0
- `next-themes` ^0.4.6
- `radix-ui` ^1.4.3
- `react` ^19.2.6
- `react-day-picker` ^10.0.1
- `react-dom` ^19.2.6
- `react-router-dom` ^7.16.0
- `shadcn` ^4.10.0
- `socket.io-client` ^4.8.3
- `sonner` ^2.0.7
- `tailwind-merge` ^3.6.0
- `tw-animate-css` ^1.4.0

devDependencies:
- `@eslint/js` ^10.0.1
- `@vitejs/plugin-react` ^6.0.1
- `autoprefixer` ^10.5.0
- `eslint` ^10.3.0
- `eslint-plugin-react-hooks` ^7.1.1
- `eslint-plugin-react-refresh` ^0.5.2
- `globals` ^17.6.0
- `postcss` ^8.5.15
- `tailwindcss` ^4.3.0
- `vite` ^8.0.12

### UI libraries actually used
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin; theme defined with `@theme` in `index.css` (no `tailwind.config.js` file exists).
- **Radix UI** (`radix-ui` package) — used directly for `Popover` (date pickers, register company combobox).
- **lucide-react** — icon set used across every page.
- **framer-motion** — page/modal/card animations.
- **sonner** — toast notifications (`<Toaster richColors position="top-right" />`).
- **react-day-picker** + **date-fns** — calendar widgets in the custom date pickers.
- **class-variance-authority / clsx / tailwind-merge** — `cn()` helper in `lib/utils.js`.
- `shadcn`, `next-themes`, `tw-animate-css` are installed but only two hand-built components live under `components/ui/` (date-picker, date-range-picker); no generated shadcn component library is present beyond those.

### Build / config
- **`frontend/vite.config.js`:** plugins `react()` + `tailwindcss()`; alias `@` → `./src`.
- **`frontend/index.html`:** title `PharmaBridge`, favicon `/icon.png`, Google Fonts **Inter** (weights 400–800), mounts `#root` from `/src/main.jsx`.
- No `tsconfig.json` exists in either backend or frontend — the project is **JavaScript only** (matches the recorded frontend-stack decision: JS-only, React 19, Tailwind v4 `@theme`, Inter).

---

## 2. Project Structure

### `backend/src/`
```
backend/src/
├── app.js                      # express + http + socket.io entry point
├── config/
│   ├── cloudinary.js           # configured cloudinary v2 instance
│   ├── db.js                   # mysql2 pool + idempotent startup migration
│   └── nodemailer.js           # Gmail SMTP transporter (UNUSED by current code)
├── controllers/
│   ├── admin.controller.js
│   ├── auth.controller.js
│   ├── company.controller.js
│   ├── driver.controller.js
│   ├── market.controller.js
│   ├── notifications.controller.js
│   └── pharmacy.controller.js
├── middleware/
│   ├── auth.js                 # JWT verify + live is_active check
│   ├── errorHandler.js         # AppError, errorHandler, notFound
│   ├── role.js                 # requireRole(...roles)
│   └── upload.js               # multer memory storage + handleUploadError
├── routes/
│   ├── admin.routes.js
│   ├── auth.routes.js
│   ├── company.routes.js
│   ├── driver.routes.js
│   ├── market.routes.js
│   ├── notifications.routes.js
│   └── pharmacy.routes.js
├── services/
│   ├── email.service.js        # Resend wrapper (sendEmail)
│   └── socket.service.js       # emitToUser helper
└── utils/
    └── pricing.js              # effectivePrice / unitEffectivePrice / unitListPrice / round2
```

### `frontend/src/`
```
frontend/src/
├── App.jsx                     # all routes
├── main.jsx                    # React root, providers, Toaster
├── index.css                   # Tailwind v4 @theme design tokens + global styles
├── components/
│   ├── market/
│   │   └── CountdownTimer.jsx
│   ├── shared/
│   │   ├── DashboardLayout.jsx
│   │   ├── ErrorMessage.jsx
│   │   ├── LoadingSpinner.jsx
│   │   ├── Navbar.jsx
│   │   ├── NotificationBell.jsx
│   │   ├── PrivateRoute.jsx
│   │   ├── Sidebar.jsx
│   │   ├── SkeletonRow.jsx
│   │   └── StatusBadge.jsx
│   └── ui/
│       ├── date-picker.jsx
│       └── date-range-picker.jsx
├── context/
│   ├── AuthContext.jsx
│   └── CartContext.jsx
├── hooks/
│   ├── useAuth.js
│   ├── useCart.js
│   └── useSocket.js
├── lib/
│   ├── api.js                  # axios instance + interceptors
│   └── utils.js                # cn, date/currency formatters, status helpers
└── pages/
    ├── Landing.jsx
    ├── NotFound.jsx
    ├── VerifyEmail.jsx
    ├── admin/
    │   ├── Categories.jsx
    │   ├── Companies.jsx
    │   ├── Drivers.jsx
    │   ├── Market.jsx
    │   ├── Orders.jsx
    │   ├── Pharmacies.jsx
    │   ├── ProductTypes.jsx
    │   ├── Registrations.jsx
    │   └── Reports.jsx
    ├── auth/
    │   ├── Login.jsx
    │   └── Register.jsx
    ├── company/
    │   ├── Drivers.jsx
    │   ├── Financial.jsx
    │   ├── Market.jsx
    │   ├── Orders.jsx
    │   └── Products.jsx
    ├── driver/
    │   ├── Delivery.jsx
    │   └── Orders.jsx
    └── pharmacy/
        ├── Cart.jsx
        ├── Financial.jsx
        ├── Market.jsx
        ├── Orders.jsx
        └── ProductDetail.jsx
```

---

## 3. Database

Engine: MySQL/InnoDB, `utf8mb4` / `utf8mb4_unicode_ci` (chosen so Arabic names store safely).
Database name: `pharma_platform`.

> The schema file is titled "15 tables" but actually defines **16 tables** — `product_units`
> (section 7b) was added later and folded into the consolidated file.

### Tables (all columns + key constraints)

**1. `users`**
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK AI | |
| email | VARCHAR(255) NOT NULL UNIQUE | |
| password_hash | VARCHAR(255) NOT NULL | |
| role | ENUM('admin','company','pharmacy','driver') NOT NULL | |
| is_active | BOOLEAN NOT NULL DEFAULT FALSE | false until approved |
| email_verified | BOOLEAN NOT NULL DEFAULT FALSE | admins seeded TRUE |
| email_verification_token | VARCHAR(255) NULL | one-shot, no TTL |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE | |

**2. `companies`**
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK AI | |
| user_id | BIGINT NOT NULL UNIQUE | FK users(id) ON DELETE CASCADE |
| name | VARCHAR(255) NOT NULL | |
| logo_url | VARCHAR(500) NULL | |
| phone | VARCHAR(30) NULL | |
| description | TEXT NOT NULL | 'N/A' when unset |
| address | VARCHAR(255) NOT NULL | 'N/A' when unset |
| registration_status | ENUM('pending','accepted','rejected') DEFAULT 'pending' | |
| rejection_reason | TEXT NULL | |
| registered_at | DATETIME DEFAULT CURRENT_TIMESTAMP | |

**3. `pharmacies`** — same shape as companies plus `owner_name VARCHAR(255) NULL`; `user_id` FK → users ON DELETE CASCADE.

**4. `drivers`**
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK AI | |
| user_id | BIGINT NOT NULL UNIQUE | FK users(id) CASCADE |
| company_id | BIGINT NOT NULL | FK companies(id) CASCADE — company they applied to |
| full_name | VARCHAR(255) NOT NULL | |
| phone | VARCHAR(30) NULL | |
| vehicle_info | VARCHAR(255) NULL | free text |
| profile_photo_url | VARCHAR(500) NULL | |
| description | TEXT NOT NULL | |
| address | VARCHAR(255) NOT NULL | |
| registration_status | ENUM('pending','accepted','rejected') DEFAULT 'pending' | |
| rejection_reason | TEXT NULL | |
| is_fired | BOOLEAN NOT NULL DEFAULT FALSE | |
| registered_at | DATETIME DEFAULT CURRENT_TIMESTAMP | |
| rating_avg | DECIMAL(3,2) NOT NULL DEFAULT 0.00 | cached by trigger |
| rating_count | INT NOT NULL DEFAULT 0 | cached by trigger |

**5. `product_categories`**
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK AI | |
| name | VARCHAR(100) NOT NULL | |
| description | VARCHAR(255) NULL | |
| company_id | BIGINT NULL | FK companies(id) ON DELETE SET NULL; NULL = global |
| created_by_admin | BOOLEAN NOT NULL DEFAULT TRUE | |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | |

**6. `product_types`** — `id BIGINT PK AI`, `name VARCHAR(100) NOT NULL`. Seeded on install with Arabic defaults: دواء, شامبو, كريم, مكمل غذائي, مستلزمات طبية, عطور, أخرى.

**7. `products`**
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK AI | |
| company_id | BIGINT NOT NULL | FK companies(id) CASCADE |
| product_type_id | BIGINT NOT NULL | FK product_types(id) RESTRICT |
| category_id | BIGINT NOT NULL | FK product_categories(id) RESTRICT |
| name | VARCHAR(255) NOT NULL | |
| description | TEXT NULL | |
| price | DECIMAL(10,2) NOT NULL | base price |
| quantity_in_stock | INT NOT NULL DEFAULT 0 | base units |
| is_active | BOOLEAN NOT NULL DEFAULT TRUE | |
| has_offer | BOOLEAN NOT NULL DEFAULT FALSE | |
| offer_price | DECIMAL(10,2) NULL | |
| offer_starts_at | DATETIME NULL | |
| offer_ends_at | DATETIME NULL | |
| rating_avg | DECIMAL(3,2) DEFAULT 0.00 | cached by trigger |
| rating_count | INT DEFAULT 0 | cached by trigger |
| total_orders | INT DEFAULT 0 | drives "most ordered" |
| created_at / updated_at | DATETIME | |

**7b. `product_units`** (Single / Box / Carton packaging tiers)
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK AI | |
| product_id | BIGINT NOT NULL | FK products(id) CASCADE |
| unit_name | VARCHAR(100) NOT NULL | |
| units_count | INT NOT NULL DEFAULT 1 | base units per pack |
| discount_percent | DECIMAL(5,2) NOT NULL DEFAULT 0 | 0–100 |
| final_price | DECIMAL(10,2) NULL | hard override of the calc |
| is_default | BOOLEAN NOT NULL DEFAULT FALSE | |
| created_at / updated_at | DATETIME | |
| | | UNIQUE `uq_product_unit_name (product_id, unit_name)`, KEY `idx_product_units_product` |

**8. `product_images`** — `id`, `product_id` FK CASCADE, `image_url VARCHAR(500)` (Cloudinary URL), `cloudinary_id VARCHAR(255)` (for deletion), `sort_order TINYINT DEFAULT 0` (0 = main), `created_at`.

**9. `orders`**
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK AI | |
| pharmacy_id | BIGINT NOT NULL | FK pharmacies(id) RESTRICT |
| company_id | BIGINT NOT NULL | FK companies(id) RESTRICT |
| driver_id | BIGINT NULL | FK drivers(id) SET NULL |
| status | ENUM('pending','accepted','rejected','picked_up','on_the_way','arrived','delivered','partially_delivered') DEFAULT 'pending' | |
| rejection_reason | TEXT NULL | |
| total_amount | DECIMAL(10,2) DEFAULT 0 | |
| paid_amount | DECIMAL(10,2) DEFAULT 0 | |
| notes | TEXT NULL | |
| created_at / updated_at | DATETIME | |

**10. `order_items`** — `id`, `order_id` FK CASCADE, `product_id` FK RESTRICT, `product_unit_id BIGINT NULL` FK SET NULL, `quantity_ordered INT NOT NULL` (in packs), `quantity_rejected INT DEFAULT 0`, `unit_price DECIMAL(10,2)` (per pack, frozen at order time), `rejection_reason TEXT NULL`.

**11. `order_status_log`** — `id`, `order_id` FK CASCADE, `status ENUM('accepted','picked_up','on_the_way','arrived','delivered','partially_delivered')` (note: no `rejected` value), `changed_by BIGINT NOT NULL` FK users(id) RESTRICT, `note TEXT NULL`, `changed_at DATETIME`.

**12. `financial_records`**
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK AI | |
| order_id | BIGINT NOT NULL UNIQUE | FK orders(id) RESTRICT |
| pharmacy_id | BIGINT NOT NULL | FK pharmacies(id) RESTRICT |
| company_id | BIGINT NOT NULL | FK companies(id) RESTRICT |
| order_total | DECIMAL(10,2) NOT NULL | |
| paid_amount | DECIMAL(10,2) DEFAULT 0 | |
| **debt_amount** | DECIMAL(10,2) **GENERATED ALWAYS AS (order_total - paid_amount) STORED** | |
| previous_debt | DECIMAL(10,2) DEFAULT 0 | snapshot at delivery |
| collected_at | DATETIME NULL | |
| driver_id | BIGINT NULL | FK drivers(id) SET NULL |
| created_at | DATETIME | |

**13. `ratings`** — `id`, `pharmacy_id` FK CASCADE, `order_id` FK CASCADE, `product_id BIGINT NULL` FK CASCADE, `driver_id BIGINT NULL` FK CASCADE, `stars TINYINT NOT NULL`, `created_at`. Constraints: UNIQUE `uq_rating_product (pharmacy_id, order_id, product_id)`, UNIQUE `uq_rating_driver (pharmacy_id, order_id, driver_id)`, CHECK `chk_rating_target` (exactly one of product_id/driver_id set), CHECK `chk_stars` (1–5).

**14. `cart_items`** — `id`, `pharmacy_id` FK CASCADE, `product_id` FK CASCADE, `product_unit_id BIGINT NULL` FK SET NULL, `quantity INT DEFAULT 1` (packs), `added_at`. UNIQUE `uq_cart_item (pharmacy_id, product_id, product_unit_id)`.

**15. `notifications`** — `id`, `user_id` FK CASCADE (recipient), `type VARCHAR(50)`, `title VARCHAR(255)`, `body TEXT NULL`, `related_order_id BIGINT NULL` FK orders SET NULL, `is_read BOOLEAN DEFAULT FALSE`, `created_at`.

### Indexes
```
idx_products_company        products(company_id)
idx_products_active         products(is_active, has_offer)
idx_products_top_orders     products(total_orders DESC)
idx_orders_pharmacy         orders(pharmacy_id)
idx_orders_company          orders(company_id)
idx_orders_status           orders(status)
idx_orders_driver           orders(driver_id)
idx_orders_created          orders(created_at)
idx_financial_pharmacy      financial_records(pharmacy_id)
idx_financial_company       financial_records(company_id)
idx_financial_debt          financial_records(debt_amount)
idx_ratings_product         ratings(product_id)
idx_ratings_driver          ratings(driver_id)
idx_notifications_user      notifications(user_id, is_read)
idx_order_status_log_order  order_status_log(order_id)
```
Plus `uq_product_unit_name` and `idx_product_units_product` on `product_units`, and the unique keys on `ratings` / `cart_items`.

### Triggers
- **`trg_update_product_rating`** — AFTER INSERT ON ratings: if `NEW.product_id` set, recompute `products.rating_avg` / `rating_count` via AVG/COUNT over ratings for that product.
- **`trg_update_driver_rating`** — AFTER INSERT ON ratings: same for `drivers` when `NEW.driver_id` set.
- **`trg_update_product_total_orders`** — AFTER UPDATE ON orders: when status goes `pending → accepted`, add `(quantity_ordered − quantity_rejected)` to each line's `products.total_orders` (net of rejections; a 100%-rejected order lands on `rejected` so this never fires for it). The startup migration recreates this trigger if the live body doesn't yet mention `quantity_rejected`.

### Views
- **`v_pharmacy_debts`** — per (company, pharmacy) rollup from `financial_records`: `company_name`, `pharmacy_name`, `SUM(order_total) AS total_billed`, `SUM(paid_amount) AS total_paid`, `SUM(debt_amount) AS total_debt`, `COUNT(order_id) AS order_count`.
- **`v_top5_products`** — top 5 active products by `total_orders DESC` with company name + main image (sort_order 0).
- **`v_active_offers`** — active products with `has_offer = TRUE` and `offer_ends_at > NOW()`, ordered by `offer_ends_at ASC`.

> The market controller re-implements top5/offers in SQL (instead of using the views) so it can
> additionally filter out deactivated/non-accepted companies.

---

## 4. API Endpoints

Base path `/api`. Response envelope is `{ success, message?, data? }`. Global routes: `GET /health`.
Middleware key: `auth` = JWT + live `is_active` check; `requireRole(...)` = role gate.

### Auth (`/api/auth`) — `auth.controller`
| Method | Path | Middleware | Handler |
|---|---|---|---|
| POST | /register | — | register |
| POST | /login | — | login |
| GET | /verify-email | — | verifyEmail (`?token=`) |
| GET | /me | auth | me |

### Admin (`/api/admin`) — `admin.controller`
`GET /product-types` is mounted **before** the admin gate and allows roles `admin, company`; everything else is `auth + requireRole('admin')`.
| Method | Path | Handler |
|---|---|---|
| GET | /product-types | getProductTypes (admin **or** company) |
| GET | /registrations | getRegistrations |
| PATCH | /registrations/:id | reviewRegistration |
| DELETE | /registrations/:id | deleteRegistration |
| POST | /companies | createCompany |
| POST | /pharmacies | createPharmacy |
| PATCH | /companies/:id | updateCompany |
| PATCH | /pharmacies/:id | updatePharmacy |
| PATCH | /companies/:id/toggle-status | toggleCompanyStatus |
| PATCH | /pharmacies/:id/toggle-status | togglePharmacyStatus |
| DELETE | /companies/:id | deleteCompany |
| DELETE | /pharmacies/:id | deletePharmacy |
| GET | /stats | getStats |
| GET | /top-debtors | getTopDebtors |
| GET | /top-companies | getTopCompanies |
| GET | /orders | getOrders |
| GET | /drivers | getAllDrivers |
| GET | /market | getMarket |
| GET | /categories | getCategories |
| POST | /categories | createCategory |
| DELETE | /categories/:id | deleteCategory |
| POST | /product-types | addProductType |
| DELETE | /product-types/:id | deleteProductType |

### Company (`/api/company`) — `company.controller` (all `auth + requireRole('company')`)
| Method | Path | Handler |
|---|---|---|
| GET | /orders | getOrders |
| PATCH | /orders/:id/accept | acceptOrder |
| PATCH | /orders/:id/reject | rejectOrder |
| PATCH | /orders/:id/reassign | reassignDriver |
| GET | /categories | getCategories |
| GET | /products | getProducts |
| POST | /products | createProduct |
| PATCH | /products/:id | updateProduct |
| DELETE | /products/:id | deleteProduct |
| POST | /products/:id/images | upload.array('images',4) + handleUploadError → uploadProductImages |
| DELETE | /products/:id/images/:imgId | deleteProductImage |
| GET | /products/:id/units | getProductUnits |
| POST | /products/:id/units | addProductUnit |
| PUT | /products/units/:unitId | updateProductUnit |
| DELETE | /products/units/:unitId | deleteProductUnit |
| GET | /drivers | getDrivers |
| PATCH | /drivers/:id/accept | acceptDriver |
| PATCH | /drivers/:id/reject | rejectDriver |
| DELETE | /drivers/:id | fireDriver |
| DELETE | /drivers/:id/delete | deleteDriver |
| GET | /financial | getFinancial |
| GET | /financial/pharmacy-debt/:pharmacy_id | getPharmacyDebt |
| POST | /financial/record-payment | recordPayment |
| GET | /market | getMarket |

### Pharmacy (`/api/pharmacy`) — `pharmacy.controller` (all `auth + requireRole('pharmacy')`)
| Method | Path | Handler |
|---|---|---|
| GET | /cart | getCart |
| POST | /cart | addToCart |
| PATCH | /cart/:id | updateCartItem |
| DELETE | /cart/:id | removeCartItem |
| POST | /cart/checkout | checkout |
| GET | /orders | getOrders |
| GET | /orders/:id | getOrderDetail |
| GET | /financial | getFinancial |
| POST | /ratings | createRating |

### Driver (`/api/driver`) — `driver.controller` (all `auth + requireRole('driver')`)
| Method | Path | Handler |
|---|---|---|
| GET | /orders | getOrders |
| GET | /orders/:id | getOrderDetail |
| PATCH | /orders/:id/accept | acceptOrder |
| PATCH | /orders/:id/reject | rejectOrder |
| PATCH | /orders/:id/status | updateStatus |
| POST | /orders/:id/deliver | deliverOrder |

### Market (`/api/market`) — `market.controller` (fully public, no auth)
| Method | Path | Handler |
|---|---|---|
| GET | /products | getProducts |
| GET | /products/top5 | getTop5 (mounted before /:id) |
| GET | /products/offers | getOffers (mounted before /:id) |
| GET | /products/:id | getProductById |
| GET | /companies | getCompanies |

### Notifications (`/api/notifications`) — `notifications.controller` (all `auth`, any role)
| Method | Path | Handler |
|---|---|---|
| GET | / | getNotifications |
| PATCH | /read-all | markAllRead (before /:id/read) |
| PATCH | /:id/read | markRead |

---

## 5. Backend Implementation

### App bootstrap (`app.js`)
- Loads `dotenv` first, creates Express app + HTTP server + Socket.IO server.
- CORS allows `CLIENT_URL`, `localhost:5173–5176`, and any `http://localhost:<port>` (regex). Socket.IO CORS uses the same origin function (methods GET/POST/PATCH/DELETE, credentials).
- `app.set('io', io)` so controllers reach it via `req.app.get('io')`.
- Socket: on `connection`, client emits `join` with its userId → joins room `user_${userId}`.
- Mounts the 7 route groups; then `notFound` then `errorHandler`.
- `start()` runs `initDb()` (migration); if it fails the server **still listens** so `/health` works.

### Middleware
- **`auth.js`** — requires `Authorization: Bearer <token>`, verifies with `JWT_SECRET`, then **re-reads `users.is_active` on every request** (so deactivated companies/pharmacies and fired drivers are bounced immediately, not at token expiry). Sets `req.user = { userId, role, email }`. Any failure → 401.
- **`role.js`** — `requireRole(...roles)`: 401 if no `req.user.role`, 403 if role not allowed.
- **`upload.js`** — multer memory storage; allowed MIME `image/jpeg|png|webp`; 5 MB cap; `handleUploadError` maps multer errors to a 400 JSON shape.
- **`errorHandler.js`** — `AppError(message, statusCode)`; `notFound` (404 JSON); `errorHandler` (always `{ success:false, message }`, hides real message for non-operational 500s, logs full error server-side).

### Email service (`services/email.service.js` — Resend)
`sendEmail({ to, subject, html })` calls `resend.emails.send` from `PharmaBridge <onboarding@resend.dev>`. **In production (`NODE_ENV==='production'`) it overrides every recipient with `RESEND_TEST_EMAIL`** (Resend free-tier limitation). Email types sent:
| Email | Sent when | Sender file |
|---|---|---|
| Verify your email | On registration (`POST /register`) | auth.controller |
| Account approved (with Login link) | Admin accepts a company/pharmacy registration | admin.controller |
| Registration declined (with reason) | Admin rejects a registration | admin.controller |
| Account reactivated | Admin toggles a company/pharmacy back to active | admin.controller |
| Account deactivated | Admin toggles a company/pharmacy to inactive | admin.controller |
| Driver accepted (welcome) | Company accepts a driver application | company.controller |
| Driver application declined | Company rejects a driver | company.controller |
| Employment terminated | Company fires a driver | company.controller |

All admin/company emails are fire-and-forget via `sendEmailSafe` (errors swallowed/logged); the registration verification email is wrapped in try/catch so a mail failure doesn't fail signup.

### Socket.IO service (`services/socket.service.js`)
`emitToUser(app, userId, event, data)` → `io.to('user_${userId}').emit(event, data)`, wrapped so a socket failure never breaks the request. Events emitted (sender → recipient):
| Event | Emitted by | To |
|---|---|---|
| new_registration | auth.verifyEmail | admin (company/pharmacy verified) |
| new_driver_registration | auth.verifyEmail | company (driver verified) |
| registration_update | admin.reviewRegistration | the company/pharmacy user |
| account_activated / account_deactivated | admin.toggleAccountStatus | the user |
| order_rejected | admin auto-reject + company.reject/acceptOrder | pharmacy |
| order_received | pharmacy.checkout, company.reassign | company (and reassigned driver) |
| order_accepted | company.acceptOrder | pharmacy |
| driver_assigned | company.acceptOrder | driver |
| order_reassigned | company.reassignDriver | old driver |
| driver_accepted / driver_rejected / driver_fired | company driver actions | driver |
| driver_rejected_order | driver.rejectOrder | company |
| order_status_updated | driver.updateStatus | pharmacy + company |
| order_delivered | driver.deliverOrder | pharmacy + company |

Each socket event is typically paired with a row inserted into `notifications`.

### Cloudinary (`config/cloudinary.js`)
Configured v2 instance (`cloud_name`, `api_key`, `api_secret`, `secure:true`). Product images are uploaded in `company.uploadProductImages`: each file Buffer → base64 data URI → `cloudinary.uploader.upload` into folder `pharma-platform/products/<id>`; stores `secure_url` + `public_id` (as `cloudinary_id`) and a `sort_order`. Max 4 images/product (enforced server-side). Deletes (`deleteProductImage`, `deleteProduct`) call `cloudinary.uploader.destroy(cloudinary_id)` best-effort before removing DB rows.

### Database layer (`config/db.js`)
Single shared `mysql2/promise` pool (connectionLimit 10, `timezone '+00:00'`, `charset utf8mb4`); every fresh connection runs `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci`. `runStartupMigration()` is idempotent and self-checking (uses INFORMATION_SCHEMA helpers `columnExists`/`tableExists`/`columnInfo`/`indexColumns`): adds `users.email_verified` + `email_verification_token`, flips admins to verified, creates `product_units` + backfills a default "Single" unit per product, adds `cart_items.product_unit_id` and `order_items.product_unit_id`, widens `uq_cart_item` to include packaging (backfilling NULLs first), recreates `trg_update_product_total_orders` net-of-rejections, and ensures `description`/`address` NOT NULL on companies/pharmacies/drivers (backfilling 'N/A').

### Key business logic per controller
- **auth** — register validates email format + **MX record lookup** for the domain, strong-password rules (≥8, upper, lower, number, special `!@#$%^&*`), role-specific required fields, plus required `description` + `address` for everyone; creates user + role profile in a transaction; emails a verification link. `verify-email` flips `email_verified`, clears token, and notifies the relevant approver (admin for company/pharmacy, the company for a driver). Login blocks unverified (non-admin), inactive, and fired-driver accounts; returns `{ token, role }` (JWT 7-day expiry, payload `{userId, role, email}`). `me` returns the role-specific profile joined with email.
- **admin** — registration review (accept/reject in a transaction with notification + email + socket); when **deactivating a company** it auto-rejects that company's pending orders and **restores stock** (packs × units_count) + notifies pharmacies; hand-creates company/pharmacy accounts (active + verified immediately, 'N/A' defaults); edits public profile + optional password; hard-delete only when there is **zero order history** (company delete also cleans up its private categories in a transaction); `getStats` computes KPIs in SQL over delivered orders; `getTopDebtors` (HAVING debt > 0) and `getTopCompanies` (by `SUM(paid_amount)`).
- **company** — paginated incoming orders with JSON-aggregated items + status log. `acceptOrder` supports partial/full **item rejection at accept time** (returns rejected stock, recomputes total over accepted qty; if everything is rejected → status `rejected`, no driver); requires an accepted/non-fired driver otherwise. `rejectOrder` restores stock. `reassignDriver` swaps drivers on in-progress orders. Full product CRUD + tiered `product_units` (normalize/validate, exactly one default, can't delete the last unit) + Cloudinary images. Driver accept/reject/fire/delete (delete blocked when the driver has history). Financial: list + `v_pharmacy_debts` summary, `getPharmacyDebt`, and `recordPayment` (a throwaway zero-value "delivered" payment order so `debt_amount` nets down by the amount).
- **pharmacy** — cart grouped by company with offer/packaging-aware pricing and per-line stock caps (`floor(stock/units_count)`). `addToCart`/`updateCartItem` re-check stock; `checkout` revalidates product+company availability, **splits the cart into one order per company**, decrements stock under `FOR UPDATE` row locks (reservation happens at checkout, not at accept), clears the cart, notifies each company. Orders list/detail; financial list + summary; `createRating` (product XOR driver, only after delivery, only items/driver on that order, dup → 409).
- **driver** — assigned orders list/detail (detail also shows the pharmacy's prior debt to that company). `acceptOrder`/`rejectOrder` (reject returns the order to `pending`, clears driver, and reverses the `total_orders` bump; does **not** restore stock since the reservation stands). `updateStatus` enforces the progression `accepted→picked_up→on_the_way→arrived`. `deliverOrder` is the big flow (see §12): item returns + stock restore, capped payment, financial_records upsert, status `delivered`/`partially_delivered`.
- **market** — public browse with whitelisted sort map, price/company/type/category filters, only active products from accepted+active companies; top5/offers/detail/companies.
- **notifications** — latest 20 + unread count; mark one read (scoped by user); mark all read.

---

## 6. Frontend Pages (per role)

### Landing (`pages/Landing.jsx`) — public
Sticky nav (logo + Login/Register). Hero (Unsplash background image + dark overlay, headline "Connecting Pharma Companies to Pharmacies", Get Started / Sign In CTAs). Sections: **Features** (6 cards: B2B Marketplace, Simple Ordering, Live Delivery Tracking, Financial Records, Verified Accounts, Real-time Notifications), **How it works** (3 steps: Register → Get Verified → Start Trading), **Built for every role** (Pharma Company, Pharmacy, Driver, Admin), **Get in touch** (WhatsApp/Facebook/Instagram/X social links), footer (© 2026).

### Auth
- **Login** (`auth/Login.jsx`) — email + password (show/hide toggle), inline error, role-based redirect via `ROLE_HOME` (admin→/admin/registrations, company→/company/orders, pharmacy→/pharmacy/market, driver→/driver/orders).
- **Register** (`auth/Register.jsx`) — 3-step wizard with progress bar. Step 1: pick role (company/pharmacy/driver). Step 2 fields by role: **company** → company name, email, password (live strength meter), phone, address*, description*; **pharmacy** → pharmacy name, owner name, email, password, phone, address*, description*; **driver** → full name, email, password, phone, address*, description*, vehicle info, **company** (searchable Radix combobox loaded from `/market/companies`). Step 3: success ("check your email to verify"). (* address + description required for all roles.)
- **VerifyEmail** (`pages/VerifyEmail.jsx`) — reads `?token`, calls `/auth/verify-email`, shows loading/success/error states (guards against React StrictMode double-call with a ref).

### Admin pages
- **Registrations** — tabs Companies/Pharmacies; status filter (pending/accepted/rejected/all) + client search; accept/reject(reason)/delete actions in modals.
- **Orders** — server-side filters (status, date range, order id, pharmacy name, company name) with removable chips + pagination; read-only table.
- **Categories** — list global vs company-scoped categories; add (name/description/company) and delete (blocked if in use).
- **ProductTypes** — list/add/delete product types (delete blocked if in use).
- **Market** — read-only marketplace (banner: admins cannot add to cart); search/company/type/sort filters, load-more grid, read-only product cards with star ratings.
- **Companies** — table with search + account/registration-status filters; add company modal; edit modal (name/phone/address/description + optional password, email read-only); activate/deactivate; delete (accepted only).
- **Pharmacies** — same as Companies plus owner name.
- **Drivers** — read-only table across all companies; search + status bucket filter (active/pending/rejected/fired); shows rating.
- **Reports** — KPI cards (total/pending orders, revenue, debt, companies, pharmacies), two leaderboards (top 5 debtors, top 5 companies by revenue), top 5 products, and a date-filtered Recent Orders table.

### Company pages
- **Orders** — search + date filters, status tabs, order cards. **Accept modal** with per-item partial rejection + revised total + driver picker (full rejection becomes a reject); **Reject modal** (optional reason); **Reassign modal** (swap driver on in-progress orders); slide-over **Detail panel** with items + status timeline.
- **Products** — own catalogue with search/category/type/stock filters; card grid; read-only detail modal; add/edit **side sheet** (fields + offer toggle + **Packaging & Pricing** unit editor with live price preview + up to 4 image uploads); delete confirm.
- **Drivers** — tabs Pending/Active/Fired; accept/reject(reason)/fire/rehire/delete via cards + modals.
- **Financial** — summary cards (billed/paid/debt), Outstanding Balances list with **Record Payment** modal (capped at live debt), filters (pharmacy/date/payment-status), records table with credit badges.
- **Market** — read-only marketplace (companies can't purchase), same card style as pharmacy without add-to-cart.

### Pharmacy pages
- **Market** — debounced search + company/price/sort filters with chips; **Top 5 Most Ordered** and **Current Offers** (with countdown) carousels; browse-by-company pill tabs; product grid with per-card **Add to Cart**.
- **ProductDetail** — image gallery, company "About" block (public description + address), rating breakdown, **packaging selector** (price reflects selected unit, per-unit price shown), stock badge, quantity stepper (capped at `floor(stock/units_count)`), add to cart, ratings list.
- **Cart** — items grouped by company with per-line quantity steppers + subtotals; summary panel noting "one order per company"; place order(s).
- **Orders** — status tabs + date range (client-filtered, fetched `limit:100`); cards with driver info; slide-over detail with items, timeline, and a **rating form** (per-product + driver stars) once delivered.
- **Financial** — summary cards (spent/paid/debt), client-side company/date/payment-status filters, records table with credit badges.

### Driver pages
- **Orders** — status tabs + date range; cards show pharmacy address/phone (tap-to-call) + company; Accept/Reject (reason required) for `accepted` orders, Continue Delivery for in-progress, Completed marker.
- **Delivery** — 6-step wizard: **Pickup → On the Way → Arrived → Returns → Payment → Confirm**. Resumes at the right step from order status; status PATCHes advance steps 1–3; returns step builds rejected_items; payment step caps collected amount at total due (handles credit balances) with live status messaging; confirm submits `POST /driver/orders/:id/deliver`.

---

## 7. Frontend Components

### `components/shared/`
- **DashboardLayout** — shell: `Sidebar` (docked desktop / drawer mobile) + `Navbar` + padded `<main>`; mobile drawer state.
- **Navbar** — sticky top bar: hamburger (mobile), page title, `NotificationBell`, cart button with badge (pharmacy only), role chip, avatar initial.
- **Sidebar** — role-keyed nav links (`NAV_LINKS` for admin/company/pharmacy/driver), pharmacy gets an extra "My Cart" link with item badge, email + logout footer.
- **PrivateRoute** — gate around route groups: shows spinner while auth loads, redirects to `/login` if no token or role not in `allowedRoles`, else renders `<Outlet/>`.
- **NotificationBell** — bell with unread badge + dropdown of recent 5; fetches `/notifications`, re-fetches + bounces on any of the domain socket events, optimistic mark-read / mark-all-read.
- **StatusBadge** — colored pill using `getStatusColor`/`getStatusLabel`.
- **LoadingSpinner** — brand-green spinner (sm/md/lg).
- **ErrorMessage** — red alert box (renders nothing when message empty).
- **SkeletonRow** — shimmer table row placeholder (configurable cols).

### `components/market/`
- **CountdownTimer** — live `HH:MM:SS` countdown to `offerEndsAt`; turns red + pulses under 1 hour; shows "Expired".

### `components/ui/` (hand-built, Radix Popover + react-day-picker)
- **date-picker.jsx** — single-date picker (`DatePicker`), RTL-aware, optional `minDate`.
- **date-range-picker.jsx** — From–To range picker (`DateRangePicker`), 1 or 2 months responsive.

> shadcn/ui: aside from these two `ui/` components the project is not using a generated shadcn
> component set; the `shadcn` package is installed but no further generated components are present.

### Custom hooks
- **useAuth** — consumes `AuthContext` (throws if outside provider).
- **useCart** — consumes `CartContext`.
- **useSocket** — keeps a `socket.io-client` connection (to `VITE_SOCKET_URL`, `auth:{token}`) alive while logged in; on connect emits `join` with `user.user_id ?? user.id` (profile rows expose `user_id`, admin uses `id`).

### Context providers
- **AuthContext / AuthProvider** — holds `user`, `token`, `role`, `isLoading`; on mount fetches `/auth/me` if a token exists; `login(token, role)` and `logout()` (clears storage, redirects to `/login`).
- **CartContext / CartProvider** — holds `groups`, `totalItems`, `totalPrice`; loads the cart once role is `pharmacy`; `addItem`/`removeItem`/`updateQuantity`/`checkout`/`refreshCart` (cart endpoints return only `{success,message}` so it re-fetches after writes).

---

## 8. Frontend Routing

All routes are declared in `App.jsx` (React Router v7, `BrowserRouter` in `main.jsx`).

**Public:** `/` (Landing), `/login`, `/register`, `/verify-email`.

**Protected groups** — each parent route renders `<PrivateRoute allowedRoles={[...]} />`, whose `<Outlet/>` hosts the children; each group has an `index` route that `<Navigate>`s to the role's home:
- `/admin` → registrations | orders | categories | product-types | market | companies | pharmacies | drivers | reports (index → /admin/registrations)
- `/company` → orders | products | drivers | financial | market (index → /company/orders)
- `/pharmacy` → market | product/:id | cart | orders | financial (index → /pharmacy/market)
- `/driver` → orders | delivery/:id (index → /driver/orders)

`*` → `NotFound`.

**How protection works:** `PrivateRoute` reads `{ token, role, isLoading }` from `useAuth`; shows a spinner while loading, redirects to `/login` if there's no token or the role isn't in `allowedRoles`. **Role-based redirects:** after login, `Login.jsx` navigates via `ROLE_HOME`; each protected group's index route redirects to that role's landing page. The axios response interceptor (`lib/api.js`) treats any non-login `401` as a dead session — clears `localStorage` and hard-redirects to `/login`.

---

## 9. UI & Styling

- **Tailwind CSS v4** loaded via `@import "tailwindcss"` in `index.css`; design tokens defined with `@theme` (no config file). Tokens expose utilities like `bg-primary`, `text-text-secondary`, etc.
- **Color scheme / theme** (from `@theme` in `index.css`):
  - `--color-primary #166534` (brand green), `--color-primary-light #22c55e`, `--color-primary-subtle #f0fdf4`
  - `--color-background #f8fafc`, `--color-surface #ffffff`, `--color-border #e2e8f0`
  - `--color-text-primary #0f172a`, `--color-text-secondary #64748b`
  - `--color-danger #dc2626`, `--color-warning #d97706`, `--color-success #16a34a`
  - Font `--font-sans: "Inter", ...`; custom easings `--ease-out-quart`, `--ease-out-expo`, `--ease-spring`.
- **Global styles:** Inter with `letter-spacing -0.011em` + `font-feature-settings "cv11","ss01"`, antialiasing; balanced/`pretty` text-wrap on headings/paragraphs; brand focus-visible ring; branded selection; custom slim scrollbars; `prefers-reduced-motion` overrides; restyled react-day-picker (`.rdp-*`) and Radix popover open/close keyframes (`pb-popover`).
- **Responsive design:** mobile-first. Sidebar is a slide-in drawer below `md` (hamburger in Navbar) and docked at `md+` (`md:ml-60` content offset). Tables sit in horizontal-scroll wrappers with `min-w-*`; product grids scale `grid-cols-2 → md:grid-cols-3 → lg:grid-cols-4`; date-range picker shows 2 months at `sm+`, 1 below. Toasts top-right via sonner.
- **Iconography:** lucide-react throughout. Avatars fall back to `ui-avatars.com`; product images fall back to a `placehold.co` placeholder.

---

## 10. Real-time Features

### Socket.IO
Server in `app.js`; client in `hooks/useSocket.js`. Rooms are per-user (`user_${userId}`); client joins on connect using `user_id` (role rows) or `id` (admin). All events are server→client (the server never listens for domain events from clients, only `join`/`disconnect`). The full event list with direction is in **§5 → Socket.IO service**.

### Notification system
- **Storage:** persistent `notifications` table rows (recipient `user_id`, `type`, `title`, `body`, optional `related_order_id`, `is_read`). Almost every socket emit is paired with an inserted notification row inside the relevant controller (often within the same transaction as the state change).
- **Display:** `NotificationBell` fetches `GET /notifications` (latest 20 + unread count), renders the recent 5 in a dropdown with an unread dot and relative time (`timeAgo`). It subscribes to the domain socket events and, on any of them, re-fetches and bounces the bell. Mark-one-read and mark-all-read are optimistic UI updates backed by `PATCH /notifications/:id/read` and `/notifications/read-all`.

---

## 11. Security Implementation

- **JWT:** issued on login (`auth.controller.login`) with payload `{ userId, role, email }`, signed with `JWT_SECRET`, **7-day** expiry (`JWT_EXPIRY = '7d'`). Verified in `middleware/auth.js` on every protected request, which **additionally re-reads `users.is_active`** on each call so deactivated/fired accounts lose access immediately (token is not "refreshed" — no refresh-token mechanism; client just keeps the 7-day token in `localStorage`). Login response returns only `{ token, role }`.
- **bcrypt:** `BCRYPT_ROUNDS = 12` for all password hashing (registration, admin-created accounts, admin password edits).
- **Password policy:** ≥8 chars, at least one uppercase, lowercase, number, and special char `!@#$%^&*` (enforced server-side in auth + admin; mirrored client-side in the Register strength meter).
- **Role-based access:** `requireRole(...)` middleware after `auth`; route groups gate each role; the single exception is `GET /api/admin/product-types` which allows `admin` **or** `company`.
- **Email verification flow:** signup creates an inactive, unverified user with a random 32-byte hex token (`crypto.randomBytes`), emailed as a `/verify-email?token=` link. `verify-email` sets `email_verified = TRUE`, **nulls the token** (one-shot, no expiry/TTL), then notifies the approver (admin for company/pharmacy, the company for a driver). Login blocks non-admin users who haven't verified, then blocks users who aren't `is_active` (pending approval), then blocks fired drivers. Registration also validates email format and performs a **DNS MX lookup** on the domain (skipped gracefully if DNS is unavailable).
- **Other:** CORS origin allowlist; multer restricts image MIME types + 5 MB; SQL uses parameterized queries throughout; the error handler hides internal messages for non-operational 500s; market sort uses a whitelist map (no user input interpolated into ORDER BY).

---

## 12. Financial System

### `debt_amount` (generated column)
`financial_records.debt_amount` is `GENERATED ALWAYS AS (order_total - paid_amount) STORED`, so debt can never drift from total − paid. A **negative** `debt_amount` represents a credit (overpayment / manual payment toward earlier debt). `idx_financial_debt` backs debt queries.

### `financial_records` logic
- Written on delivery (`driver.deliverOrder`) as an **upsert keyed on `order_id`** (re-running deliver doesn't duplicate the record): stores `order_total` (after item rejections), `paid_amount` (capped — see below), `previous_debt` snapshot, `collected_at`, and the collecting `driver_id`.
- Manual debt payments (`company.recordPayment`) create a throwaway zero-value order (`status='delivered'`, total 0) and a `financial_record` with `order_total = 0`, `paid_amount = amount` → `debt_amount = −amount`, which lowers `v_pharmacy_debts.total_debt` by exactly that amount while `total_billed` stays put. The amount is capped at the pharmacy's current outstanding debt under a `SELECT … FOR UPDATE` lock on the pharmacy row (same lock `deliverOrder` uses to serialize settlements).
- Rollups come from `v_pharmacy_debts` (per company/pharmacy: total_billed, total_paid, total_debt, order_count). Admin stats sum delivered orders only.

### What the driver sees at delivery time (`deliverOrder` + `driver/Delivery.jsx`)
The delivery wizard computes: **current order total** (after subtracting returned items: `quantity_rejected × unit_price`), the pharmacy's **previous debt** to that company (`SUM(debt_amount)` excluding this order, surfaced by `getOrderDetail`), and **total due = current total + previous debt**. The collected amount input is **capped at total due** (no overpayment stored, since `debt_amount` would otherwise go negative); if the pharmacy is already in credit (`totalDue ≤ 0`) the field is locked at 0. On confirm: returned packs are restored to stock (`quantity_rejected × units_count`), order status becomes `delivered` or `partially_delivered`, and the financial record is upserted. The server independently re-applies the same cap (`cappedPaid = totalDue ≤ 0 ? 0 : min(paidAmount, totalDue)`).

> Stock model: stock is reserved (decremented) at **checkout**, not at company-accept. It is
> restored on company reject, admin-deactivation auto-reject, accept-time item rejection, and
> delivery-time returns. A driver rejecting an order back to `pending` deliberately does **not**
> restore stock (the reservation stands).

---

## 13. Deployment

- **Frontend → Vercel.** `frontend/.env.production` points the build at the Railway backend:
  - `VITE_API_URL=https://pharmabridge-production-d3ad.up.railway.app/api`
  - `VITE_SOCKET_URL=https://pharmabridge-production-d3ad.up.railway.app`
  - Build via `vite build` (Vite 8, React plugin, Tailwind plugin, `@`→`src` alias). Local `.env.example`: `VITE_API_URL=http://localhost:5000/api`, `VITE_SOCKET_URL=http://localhost:5000`.
- **Backend → Railway.** Express 5 on `PORT` (default 5000). `backend/.env.example` documents the required env vars:
  - `JWT_SECRET`
  - MySQL: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` (default 3306)
  - Email (Resend): `RESEND_API_KEY` (code also reads `RESEND_TEST_EMAIL` and `NODE_ENV`)
  - Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - App: `CLIENT_URL`, `PORT`
  - (The nodemailer config additionally reads `EMAIL_HOST`/`EMAIL_USER`/`EMAIL_PASS`, but that file is unused — see §14.)
- **Database → Railway MySQL.** Connection built from the `DB_*` env vars via the `mysql2` pool; session forced to `utf8mb4`; `initDb()` runs the idempotent startup migration on boot. The schema can be reproduced fresh from `schema_final.sql`.
- **Image storage → Cloudinary.** Product images under folder `pharma-platform/products/<productId>`; URLs + public ids stored in `product_images`.

> Actual Vercel/Railway dashboard URLs and secret values are not in the repo; only the Railway
> backend origin (above, from `.env.production`) is committed.

---

## 14. Known Issues / Limitations

Strictly from what is present in the code:

1. **Unused nodemailer config.** `config/nodemailer.js` builds a Gmail SMTP transporter but is not imported anywhere; the live email path is Resend (`services/email.service.js`). Both packages are installed and `.env.example` only lists `RESEND_API_KEY`. The `EMAIL_HOST/EMAIL_USER/EMAIL_PASS` vars the nodemailer file reads are dead config.
2. **Production emails are redirected.** When `NODE_ENV==='production'`, `sendEmail` overrides every recipient with `RESEND_TEST_EMAIL` (Resend free-tier limitation) — real users do **not** receive their verification/approval emails in production as written. The intended recipient is only logged.
3. **Verification token has no expiry.** `email_verification_token` is a one-shot value cleared on use, but there is no TTL — an un-clicked token stays valid indefinitely until verification.
4. **Schema "15 tables" mismatch.** `schema_final.sql` is titled "15 tables" but defines 16 (`product_units` was added as 7b).
5. **Leftover debug `console.log`s in committed code:**
   - `company/Products.jsx` `ProductCard` — `console.log("[ProductCard] images for", ...)` marked `// TEMP`.
   - `admin/Registrations.jsx` `confirmDelete` — `console.log(id, type)`.
   - `auth.controller.js` — `[register]` and `[verify-email]` info logs.
6. **`order_status_log` has no `rejected` value**, so rejections (company reject, accept-time full reject, admin auto-reject) deliberately skip writing a log row; the reason is recorded only in `orders.rejection_reason` (noted in code comments).
7. **`tw-animate-css`, `next-themes`, and most of `shadcn`** are installed but effectively unused beyond the two hand-built `ui/` date components; theming is light-only (no dark mode wired up despite `next-themes`).
8. **No automated tests** exist in the repository (no test runner, no test files).
9. **CORS allows any `http://localhost:<port>`** via regex — convenient for dev, broad for production.
