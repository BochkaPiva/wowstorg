# API Plan (No implementation yet)

## Auth

- `POST /api/auth/telegram/init`
  - Verify Telegram `initData`, resolve/create user, establish session context.

## Items and availability

- `GET /api/items`
  - Catalog list with filters, search, categories, and date-range availability.
- `GET /api/items/:id`
  - Item details, availability status, stock metadata.
- `GET /api/categories`
  - Category dictionary for filters and navigation.
- `GET /api/kits`
  - Kit list with lines for cart expansion.
- `GET /api/kits/:id`
  - Single kit with default quantities.

## Orders (Greenwich)

- `POST /api/orders`
  - Create order with lines, date range, optional pickup time/notes.
- `GET /api/orders/my`
  - Current user order list and statuses.
- `GET /api/orders/:id`
  - Order details (owner or authorized warehouse/admin).
- `PATCH /api/orders/:id`
  - Edit order by owner only when status is `SUBMITTED`; updates `updatedAt`.
- `POST /api/orders/:id/return-declared`
  - Greenwich confirms items have been returned.

## Orders (Warehouse/Admin)

- `GET /api/warehouse/queue`
  - Queue by status with emergency prioritization and "updated X minutes ago".
- `POST /api/orders/:id/approve`
  - Approve submitted order, optionally reduce line quantities.
- `POST /api/orders/:id/issue`
  - Confirm physically issued quantities (partial issue allowed).
- `POST /api/orders/:id/check-in`
  - Register check-in lines, conditions, and close order if complete.

## Admin and reference data

- `POST /api/admin/items`
- `PATCH /api/admin/items/:id`
- `DELETE /api/admin/items/:id`
- `POST /api/admin/categories`
- `POST /api/admin/kits`
- `POST /api/admin/users`
- `POST /api/admin/items/import-csv`
- `GET /api/admin/items/export-csv`

## Incidents and problem items

- `GET /api/incidents`
  - Incident list by period/type/item.
- `GET /api/problem-items`
  - Items not in `ACTIVE`.
- `POST /api/items/:id/mark-active`
  - Set repaired item back to `ACTIVE`.

## Analytics

- `GET /api/analytics/top-items`
  - Top rented items for period.
- `GET /api/analytics/incidents`
  - Incidents summary by period/type.
- `GET /api/analytics/low-stock`
  - Low stock / bottleneck items.
