# Database Schema / ER Diagram

12 tables, matching the traceability chain `Customer -> Enquiry -> Quotation -> Sales Order -> Dispatch`, plus a `Product`/`Inventory` pair that every stage references.

```mermaid
erDiagram
    USERS ||--o{ ENQUIRIES : "created_by"
    USERS ||--o{ QUOTATIONS : "created_by"
    USERS ||--o{ SALES_ORDERS : "created_by"
    USERS ||--o{ DISPATCHES : "created_by"

    CUSTOMERS ||--o{ ENQUIRIES : "customer_id"

    PRODUCTS ||--|| INVENTORY : "product_id (unique)"
    PRODUCTS ||--o{ ENQUIRY_ITEMS : "product_id"
    PRODUCTS ||--o{ QUOTATION_ITEMS : "product_id"
    PRODUCTS ||--o{ SALES_ORDER_ITEMS : "product_id"

    ENQUIRIES ||--o{ ENQUIRY_ITEMS : "enquiry_id"
    ENQUIRIES ||--o{ QUOTATIONS : "enquiry_id"

    QUOTATIONS ||--o{ QUOTATION_ITEMS : "quotation_id"
    QUOTATIONS ||--o| SALES_ORDERS : "quotation_id (unique)"

    SALES_ORDERS ||--o{ SALES_ORDER_ITEMS : "sales_order_id"
    SALES_ORDERS ||--o{ DISPATCHES : "sales_order_id"

    DISPATCHES ||--o{ DISPATCH_ITEMS : "dispatch_id"
    SALES_ORDER_ITEMS ||--o{ DISPATCH_ITEMS : "sales_order_item_id"

    USERS {
        int id PK
        string name
        string email UK
        string password_hash
        enum role "ADMIN or SALES"
    }

    CUSTOMERS {
        int id PK
        string company_name
        string contact_person
        string mobile
        string email
        string city
    }

    PRODUCTS {
        int id PK
        string code UK
        string name
        string category
        string unit
        decimal base_price "CHECK >= 0"
    }

    INVENTORY {
        int id PK
        int product_id FK, UK
        int physical_qty "CHECK >= 0"
        int reserved_qty "CHECK 0 <= reserved <= physical"
    }

    ENQUIRIES {
        int id PK
        string enquiry_number UK
        int customer_id FK
        date enquiry_date
        date required_date
        enum status "NEW, QUOTED, WON, LOST"
        int created_by FK
    }

    ENQUIRY_ITEMS {
        int id PK
        int enquiry_id FK
        int product_id FK
        int quantity "CHECK > 0; UNIQUE(enquiry_id, product_id)"
    }

    QUOTATIONS {
        int id PK
        string quotation_number UK
        int enquiry_id FK
        date valid_until
        enum status "DRAFT, SENT, ACCEPTED, REJECTED"
        decimal grand_total
        int created_by FK
    }

    QUOTATION_ITEMS {
        int id PK
        int quotation_id FK
        int product_id FK
        int quantity "CHECK > 0"
        decimal unit_price "CHECK >= 0"
        decimal discount_pct "CHECK 0-100"
        decimal gst_pct "CHECK 0-100"
        decimal base_amount
        decimal discount_amount
        decimal gst_amount
        decimal line_amount
    }

    SALES_ORDERS {
        int id PK
        string order_number UK
        int quotation_id FK, UK
        date order_date
        decimal total_amount
        enum status "PENDING, CONFIRMED, DISPATCHED, CANCELLED"
        datetime confirmed_at
        int created_by FK
    }

    SALES_ORDER_ITEMS {
        int id PK
        int sales_order_id FK
        int product_id FK
        int quantity "CHECK > 0; UNIQUE(sales_order_id, product_id)"
        decimal unit_price
        decimal line_amount
        int dispatched_qty "CHECK 0 <= dispatched <= quantity"
    }

    DISPATCHES {
        int id PK
        string dispatch_number UK
        int sales_order_id FK
        date dispatch_date
        string vehicle_number
        string driver_name
        int created_by FK
    }

    DISPATCH_ITEMS {
        int id PK
        int dispatch_id FK
        int sales_order_item_id FK
        int quantity "CHECK > 0; UNIQUE(dispatch_id, sales_order_item_id)"
    }
```

## Design notes

- **`inventory.available` is never stored** — it's always `physical_qty - reserved_qty`, computed at read time by the API. Storing a derived value invites it to drift out of sync; computing it guarantees it never can.
- **`sales_orders.quotation_id` is `UNIQUE`**, not just indexed — this makes "one quotation produces one order" a structural guarantee enforced by Postgres itself, not just application logic, so it holds even under a race between two simultaneous convert requests.
- **CHECK constraints are the last line of defence.** `reserved_qty <= physical_qty`, `dispatched_qty <= quantity`, and the various `> 0` / `0-100` bounds are enforced at the database level. Even if a bug slipped past the API's own validation, Postgres would still refuse to store an invalid row.
- **Composite `UNIQUE(parent_id, product_id)`** on every line-item table (`enquiry_items`, `quotation_items`, `sales_order_items`) prevents the same product from silently appearing twice on one document — a second attempt to add it should update the existing line, not create a duplicate.
- **Money uses `DECIMAL(12,2)` / `DECIMAL(5,2)`** throughout, never `FLOAT`, so currency and percentage values never accumulate binary floating-point rounding error.
- **`dispatches.sales_order_id` is deliberately *not* unique** — partial dispatch means one Sales Order can have several dispatch records over time, each covering whatever quantity shipped that day.
