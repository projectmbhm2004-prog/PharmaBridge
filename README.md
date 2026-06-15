# PharmaBridge

**PharmaBridge** is a B2B medicine-delivery platform that connects pharmaceutical
companies, pharmacies, and drivers through an admin-managed marketplace.
Pharmacies browse an online market, place orders from one or more companies,
companies fulfil and dispatch them, and company drivers carry out the delivery —
all coordinated in real time.

---

## Roles

| Role | Capabilities |
|------|--------------|
| **Admin** | Approves/rejects company & pharmacy registrations, manages product categories and product types, oversees the marketplace, and views platform-wide orders and reports. |
| **Company** | Manages its product catalog (products, images, tiered packaging units, offers), reviews incoming orders, accepts/rejects them (including partial-item rejection), assigns drivers, and tracks finances and pharmacy debts. |
| **Pharmacy** | Browses the market, builds a multi-company cart, checks out (split into one order per company), tracks order/delivery status, rates products and drivers, and reviews its financial history and outstanding debt. |
| **Driver** | Sees orders assigned by their company and advances each delivery through a strict status workflow (picked up → on the way → arrived → delivered / partially delivered), recording rejected items and collected payments. |

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Backend** | Node.js, Express 5, JavaScript (CommonJS), MySQL (mysql2), Socket.io, JWT auth (jsonwebtoken), bcrypt, Multer + Cloudinary (image uploads), Nodemailer (email verification) |
| **Frontend** | React 19, Vite, Tailwind CSS v4, React Router 7, shadcn/ui (Radix UI), Axios, socket.io-client, Framer Motion, lucide-react, sonner |
| **Database** | MySQL 8 (InnoDB, utf8mb4) with views and triggers |

---

## Key Features

- **Multi-company shopping cart** — a single pharmacy cart can hold products from
  many companies and is automatically split into one order per company at checkout.
- **Tiered packaging / bulk pricing** — each product exposes sellable packaging
  units (e.g. Single, Box, Carton) via `product_units`, with per-unit bulk
  discounts or explicit final-price overrides.
- **Stock reservation at checkout** — stock is decremented (reserved) when an order
  is placed and automatically restored if the company rejects the order.
- **Partial order-item rejection** — at accept time a company can reject part of an
  item's quantity; statistics and stock are netted accordingly.
- **Real-time notifications** — Socket.io delivers order and status events instantly
  to per-user rooms (`user_{userId}`).
- **Live account-status enforcement** — account activation/deactivation takes effect
  immediately on the next authenticated request.
- **Strict delivery workflow** — drivers move orders through an enforced status
  progression (`accepted → picked_up → on_the_way → arrived → delivered /
  partially_delivered`), logged in `order_status_log`.
- **Financial & debt tracking** — `financial_records` capture order totals, paid
  amounts, and generated debt, surfaced per pharmacy/company via database views.
- **Ratings** — pharmacies rate products and drivers; averages are maintained
  automatically by database triggers.
- **Email verification** — new accounts verify their email via Nodemailer.
- **Image uploads** — product images are stored on Cloudinary.

---

## Project Structure

```
pharma-platform/
├── backend/
│   ├── src/
│   │   ├── app.js              # Express + HTTP + Socket.io entry point
│   │   ├── config/            # db (MySQL pool + startup migration), cloudinary, nodemailer
│   │   ├── controllers/       # auth, admin, company, pharmacy, driver, market, notifications
│   │   ├── middleware/        # auth (JWT), role guard, upload (multer), error handler
│   │   ├── routes/            # /api/* route definitions
│   │   ├── services/          # email, socket
│   │   └── utils/             # pricing helpers
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── main.jsx           # React entry point
    │   ├── App.jsx            # Routes
    │   ├── pages/             # admin / company / pharmacy / driver / auth pages
    │   ├── components/        # shared, market, and ui (shadcn) components
    │   ├── context/           # AuthContext, CartContext
    │   ├── hooks/             # useAuth, useCart, useSocket
    │   └── lib/               # api (axios), utils
    ├── .env.example
    └── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **MySQL** 8+
- A **Cloudinary** account (image uploads) and an **SMTP**/Gmail account (email verification)

### 1. Database

Create the schema using `schema.sql`:

```bash
mysql -u root -p < schema.sql
```

The backend also runs an idempotent startup migration on boot to keep newer
columns/tables in sync.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env   # then fill in real values
npm run dev            # starts on http://localhost:5000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL and VITE_SOCKET_URL
npm run dev            # starts the Vite dev server
```

---

## Environment Variables

Copy the provided `.env.example` files and replace the placeholders with your own
values. **Never commit real credentials.**

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret used to sign JWT auth tokens |
| `DB_HOST` | MySQL host |
| `DB_USER` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | Database name (e.g. `pharma_platform`) |
| `DB_PORT` | MySQL port (default `3306`) |
| `EMAIL_SERVICE` | Email service (e.g. `gmail`) |
| `EMAIL_USER` | Sender email address |
| `EMAIL_PASS` | Email app password |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `CLIENT_URL` | Frontend origin for CORS (e.g. `http://localhost:5174`) |
| `PORT` | Backend port (default `5000`) |

### Frontend (`frontend/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API base URL, including `/api` (e.g. `http://localhost:5000/api`) |
| `VITE_SOCKET_URL` | Socket.io server origin, no `/api` (e.g. `http://localhost:5000`) |

---

## Status & License

Graduation project — built for **educational purposes**. Not licensed for
commercial use.
