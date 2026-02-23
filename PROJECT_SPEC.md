ROLE & GOAL
You are a senior full-stack engineer + solution architect. Build a production-ready MVP for a warehouse inventory + rental workflow system used by two businesses:
- WowStorg (warehouse operators) — controls issuing/return/check-in, inventory status, incidents, analytics.
- Greenwich (internal customer team ~10 people) — creates rental requests via a Telegram Mini App “market” UI.

The system’s business value:
1) Stop warehouse chaos: no self-service, everything goes through controlled issuance & check-in.
2) Know what exists, where it is, and its condition.
3) Prevent conflicts: show accurate availability (by date), avoid “we needed 2 but only 1 free”.
4) Capture accountability: which user + which event order caused loss/breakage/repair needs.
5) Provide analytics: top rented items, incidents, low-stock/bottlenecks → future закупка decisions.
6) Make it effortless for Greenwich: market-like UI, kits, cart, fast search, minimal friction.

CRITICAL PRINCIPLES (DO NOT VIOLATE)
- Telegram Mini App is the primary UI for catalog/cart/orders; bot chat buttons are only for notifications and fallback.
- Single source of truth is Postgres DB (Supabase). Google Sheets is NOT the core.
- Greenwich can request and declare return, but ONLY warehouse confirms issuance and check-in.
- Availability is reserved ONLY after warehouse approval/issue (SUBMITTED does not reserve).
- Booking is BY DATES (time is optional, informational only for pickup preparation).
- Kits are templates: selecting a kit expands to individual cart lines (not a single composite line).
- Photos are optional (items and incidents). System must work without photos.
- Greenwich always gets 30% discount on all items; no other discount logic in MVP.
- No penalties/billing in MVP, but incidents must be recorded.

SCOPE: MVP MUST INCLUDE
A) Telegram Mini App (Next.js) with role-based UI:
   Greenwich:
   - Catalog: search, categories, availability on selected date range, price/day with -30% applied.
   - Kits: browse kits, add kit -> expands into cart lines, user can remove/adjust lines.
   - Full inventory list: browse all items.
   - Cart & checkout: date range, optional pickup time, notes, submit order.
   - My orders: list + details + “We returned” button for issued orders.
   Warehouse / Admin:
   - Queue: SUBMITTED -> approve; APPROVED/READY -> issue; RETURN_DECLARED -> check-in; emergency queue.
   - Approve: optionally reduce qty line-by-line; communicate outcome via status.
   - Issue: confirm issued qty (can be partial).
   - Check-in: per line returned qty + condition (OK/NEEDS_REPAIR/BROKEN/MISSING) + comment; bulk “all OK”.
   - Problem items view: list items not ACTIVE and ability to set back ACTIVE after repair.
   - Admin basics: CRUD Items/Categories/Kits/Users (can be minimal), CSV import/export for items.

B) Telegram Bot:
   - /start -> open webapp button
   - Notifications: new order to warehouse; approved/ready/issued to Greenwich; return declared to warehouse; closed to Greenwich
   - Fallback: /my (my orders links), /emergency (quick emergency order creation)

C) Backend API:
   - Telegram initData verification auth
   - Items listing with availability calculation by date range
   - Orders lifecycle endpoints: create, approve, issue, return-declared, check-in
   - Analytics endpoints: top items by period, incidents by period, low-stock items

D) Inventory logic:
   Item types:
   - ASSET: returned, condition tracked
   - BULK: returned in quantities; returned_qty can be less; DB stock_total decreases by missing amount during check-in
   - CONSUMABLE: decremented at issue; no check-in required
   Item availability_status:
   - ACTIVE, NEEDS_REPAIR, BROKEN, MISSING, RETIRED
   If not ACTIVE -> not orderable by Greenwich (hide or disable).

TECH STACK (FIXED)
Frontend:
- Next.js 15 App Router, React 19, TypeScript
- TailwindCSS, shadcn/ui
- Zustand (client state), TanStack Query (server data)
- Telegram WebApp SDK via window.Telegram.WebApp (or @twa-dev/sdk)
- Images: use <img> or next/image with unoptimized=true; store assets in Supabase Storage

Backend:
- Next.js Route Handlers as API
- Telegram bot webhook handler in Next.js API route
- Validation: zod
- Logging: pino
- Optional: Sentry

DB:
- Supabase Postgres
- Storage: Supabase buckets

ORM / Migrations:
- Choose Prisma (preferred for speed) OR Drizzle, but be consistent. If Prisma: provide schema.prisma + migrations.

DEPLOYMENT
- Deploy on Vercel.
- Avoid Next.js image optimization dependency due to Russia/Vercel issues; do not rely on Vercel image optimizer.
- Use webhook for Telegram bot.

DATA MODEL (REQUIRED TABLES)
Implement these entities (names can vary but must map 1:1):
- users: telegram_id unique, username, role (GREENWICH/WAREHOUSE/ADMIN)
- items: name, description, item_type, availability_status, stock_total, price_per_day, location_text
- categories + item_categories (many-to-many)
- kits + kit_lines (kit_id, item_id, default_qty)
- orders: created_by, status, start_date, end_date, pickup_time optional, notes, discount_rate (0.30), is_emergency
- order_lines: item_id, requested_qty, approved_qty, issued_qty, price_per_day_snapshot (already discounted), source_kit_id
- checkin_lines: order_line_id unique, returned_qty, condition, comment
- incidents: item_id, order_id/line_id, type, description, created_by
- optional images tables (item_images, incident_photos) but system works without them

ORDER STATUS FLOW (STRICT)
- SUBMITTED (Greenwich submits)
- APPROVED (warehouse confirms; may reduce qty)
- ISSUED (warehouse marks physically issued; sets issued_qty)
- RETURN_DECLARED (Greenwich “we returned”)
- CLOSED (warehouse completes check-in and closes)
- CANCELLED (optional)
Emergency: is_emergency=true with status SUBMITTED or EMERGENCY_ISSUED (your choice), but must appear in special queue.

AVAILABILITY ALGORITHM (DATES ONLY)
available_qty(item, start_date, end_date):
1) if item.availability_status != ACTIVE -> 0
2) reserved_qty = sum(qty) from order_lines joined orders where
   - order.status in (APPROVED, ISSUED, RETURN_DECLARED) (and any other “active” statuses you add)
   - date ranges overlap: order.start_date < end_date AND order.end_date > start_date
   - qty priority: issued_qty if set else approved_qty if set else requested_qty
3) available = max(0, item.stock_total - reserved_qty)
SUBMITTED does not reserve.

PRICING
- Price is per day: days = (end_date - start_date) in whole days
- Greenwich price_per_day_discounted = item.price_per_day * 0.7
- Store price_per_day_snapshot in order_lines at creation/approval time so history doesn’t change if prices change later.

CHECK-IN RULES
- For ASSET/BULK: require check-in_lines for each order_line to close
- For CONSUMABLE: decrement stock_total at issue; no check-in needed (or auto-checkin OK)
- If condition != OK -> create incident and set item.availability_status accordingly
- For BULK: if issued_qty - returned_qty > 0 then stock_total -= missing_amount
- Warehouse can later set item back to ACTIVE after repair

UX REQUIREMENTS (MAKE IT FEEL LIKE A MARKET)
- Very fast search + filters
- Cart with +/- quantity controls bounded by available_qty
- Kits add all lines to cart, grouped, collapsible, deletable
- Always show “in stock / available for your dates”
- Show “when free” optionally via a 14-day availability preview or next free date for requested qty

NON-GOALS (DO NOT BUILD IN MVP)
- Payments, invoicing, penalties, external client portal
- Complex time-slot scheduling
- Multi-warehouse locations beyond simple location_text
- Over-automation like AI suggestions

DELIVERABLES IN REPO
- Next.js app with pages/components for all UIs above
- API route handlers with role checks and zod validation
- Prisma schema + migrations (or Drizzle equivalent)
- Telegram bot webhook handler + message templates
- Seed scripts + CSV import/export for items
- README: local setup, env vars (Supabase URL/keys, Telegram bot token, webhook), deployment notes

IMPLEMENTATION PLAN (FOLLOW THIS ORDER)
1) DB schema + migrations + seeds
2) Telegram auth verification (initData) + session handling
3) Items API + availability calc
4) Greenwich UI: catalog, kits, cart, create order, my orders
5) Warehouse UI: queue, approve, issue, check-in, problem items
6) Telegram bot notifications & fallback commands
7) Admin CRUD + CSV import/export
8) Analytics endpoints + simple UI pages

QUALITY BAR
- TypeScript strict, no any
- Input validation everywhere (zod)
- Clear error messages in UI
- Idempotency for critical actions (issue/check-in) to prevent double clicks
- Transactional DB updates where needed (issue/checkin/stock changes)
- Access control on every API endpoint

FIRST STEP OUTPUT YOU MUST PRODUCE
Before writing major code, generate:
- Final DB schema (Prisma) and enums
- API endpoint list with request/response payload examples
- UI route map/screens list
Then proceed implementing end-to-end MVP.