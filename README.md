# FundsWeb ERP

A small ERP covering the industrial sales workflow:

```
Customer Enquiry -> Quotation -> Sales Order -> Inventory Reservation -> Dispatch
```

Built with the PERN stack (PostgreSQL, Express, React, Node) for the FundsWeb technical case study.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite, `react-router-dom`, `axios`, plain CSS |
| Backend | Node.js + Express 5 |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Auth | JWT (`jsonwebtoken`) + `bcrypt` password hashing |
| Validation | Zod |
| Tests | Jest + Supertest |

## Project Structure

```
fundsweb-erp/
├── backend/            Express API (see backend/src/routes for all endpoints)
│   ├── prisma/          schema.prisma, migrations, seed.js
│   ├── src/
│   │   ├── routes/       one file per resource (auth, customers, products, enquiries, quotations, salesOrders)
│   │   ├── middleware/    JWT auth + role authorization, central error handler
│   │   └── utils/         AppError, quotationCalc (Decimal-based money math)
│   └── tests/            5 mandatory tests + concurrency tests (Jest + Supertest)
├── frontend/            React app
│   └── src/
│       ├── pages/          Login, Enquiries, Quotations, SalesOrders
│       ├── context/        AuthContext (JWT session)
│       └── api/            axios client
└── docs/                ER diagram, Postman collection
```

## Database Setup

Three PostgreSQL databases are used, all owned by a dedicated non-superuser role (no `CREATEDB` grant needed):

| Database | Purpose |
|---|---|
| `fundsweb_erp` | Main application data |
| `fundsweb_erp_shadow` | Prisma's scratch database, used only while generating migrations |
| `fundsweb_erp_test` | Used only by the automated test suite (wiped and reseeded on every run) |

```sql
CREATE USER fundsweb_user WITH PASSWORD 'your-password-here';
CREATE DATABASE fundsweb_erp        OWNER fundsweb_user;
CREATE DATABASE fundsweb_erp_shadow OWNER fundsweb_user;
CREATE DATABASE fundsweb_erp_test   OWNER fundsweb_user;
```

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in your own values:

```env
NODE_ENV=development
PORT=4000

# Special characters in the password must be URL-encoded (e.g. '@' -> %40)
DATABASE_URL="postgresql://fundsweb_user:YOUR_PASSWORD@localhost:5432/fundsweb_erp?schema=public"
SHADOW_DATABASE_URL="postgresql://fundsweb_user:YOUR_PASSWORD@localhost:5432/fundsweb_erp_shadow?schema=public"

# Generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET="change-me"
JWT_EXPIRES_IN=8h

CLIENT_URL=http://localhost:5173
```

For running tests, create a second file `backend/.env.test` identical to the above except `DATABASE_URL` points at `fundsweb_erp_test` and `NODE_ENV=test`. Both files are git-ignored — never commit real secrets.

The frontend needs no `.env` by default (it calls `http://localhost:4000/api`); to point it elsewhere, set `VITE_API_URL` in a `frontend/.env` file.

## Migration & Seed Instructions

```bash
cd backend
npm install
npx prisma migrate deploy   # creates all 12 tables + constraints in fundsweb_erp
npm run seed                # wipes and inserts baseline demo data
```

The seed script (`prisma/seed.js`) inserts:
- 2 users: `admin@fundsweb.com` (ADMIN) and `sales@fundsweb.com` (SALES)
- 3 customers (ABC Engineering Pvt. Ltd., Shree Fabricators, Deccan Auto Components)
- 6 industrial products with realistic stock levels (Ball Bearing, Gate Valve, 5 HP Motor, Hydraulic Hose, Hex Bolt box, V-Belt) — the 5 HP Motor is deliberately seeded with only 20 units in stock, so it's easy to demonstrate the "insufficient stock" rejection live.

Re-running `npm run seed` is safe — it deletes all existing rows (children before parents) before reinserting.

## How to Run

**Backend** (http://localhost:4000):
```bash
cd backend
npm install
npm run dev        # restarts on file changes
# or: npm start
```

**Frontend** (http://localhost:5173):
```bash
cd frontend
npm install
npm run dev
```

Run both at the same time, in two terminals, then open http://localhost:5173.

## How to Run Tests

```bash
cd backend
npx prisma migrate deploy   # once, against fundsweb_erp_test (see Environment Variables above)
npm test
```

This runs 3 Jest suites against the isolated test database (never the dev database — the test helper refuses to run if `DATABASE_URL` doesn't point at a database with `test` in its name):

| File | Covers |
|---|---|
| `tests/quotationCalc.test.js` | **Test 1** — quotation totals (base/discount/GST/line/grand total) are calculated correctly |
| `tests/quotations.test.js` | **Test 2** — a DRAFT or REJECTED quotation cannot become a Sales Order. **Test 3** — the same quotation cannot generate a duplicate Sales Order |
| `tests/inventory.test.js` | **Test 4** — cannot reserve more than available inventory. **Test 5** — a Sales user cannot confirm an order (403). **Bonus** — two simultaneous reservations that together exceed stock: exactly one succeeds. Also includes an equivalent concurrency test for dispatch |

## Test Login Credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@fundsweb.com` | `Admin@123` |
| Sales | `sales@fundsweb.com` | `Sales@123` |

## Documentation

- [Database Schema / ER Diagram](docs/ER-DIAGRAM.md)
- [API Documentation (Postman collection)](docs/postman_collection.json) — import into Postman; set the collection's `baseUrl` variable (defaults to `http://localhost:4000/api`) and run **Auth > Login** first, which auto-saves the JWT into the `token` variable used by every other request.

## Key Design Decisions

- **Money is never floating point.** All quotation math (`base = qty × unitPrice`, discount, GST, line amount, grand total) runs through Prisma's `Decimal` type end-to-end (`backend/src/utils/quotationCalc.js`), never JavaScript `number` arithmetic. The client can only send `unitPrice`, `discountPct`, `gstPct` — every derived amount is computed and re-verified on the server.
- **Concurrency-safe stock reservation.** Confirming a Sales Order runs a single atomic conditional `UPDATE inventory SET reserved_qty = reserved_qty + $qty WHERE product_id = $id AND physical_qty - reserved_qty >= $qty` inside a transaction, checking the affected row count. Two simultaneous requests for more stock than is available can never both succeed — Postgres's own row locking serializes them. The same pattern (a conditional `UPDATE ... WHERE` with a row-count check) guards partial dispatch against exceeding the ordered quantity.
- **Traceability.** `Customer -> Enquiry -> Quotation -> Sales Order -> Dispatch` is enforced by foreign keys, not duplicated data. A `UNIQUE` constraint on `sales_orders.quotation_id` makes it structurally impossible for one quotation to produce two orders, even under a race (backed up by an application-level check for a friendlier error message).
- **Document numbers** (`ENQ-00001`, `QT-00001`, `SO-00001`, `DSP-00001`) are generated from Postgres's own sequence counters (`SELECT nextval(...)`), which is atomic and race-safe without any extra locking.
