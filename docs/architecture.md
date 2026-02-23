# Warehouse System Architecture (Foundation)

## Enums and statuses

- `Role`: `GREENWICH`, `WAREHOUSE`, `ADMIN`
- `ItemType`: `ASSET`, `BULK`, `CONSUMABLE`
- `AvailabilityStatus`: `ACTIVE`, `NEEDS_REPAIR`, `BROKEN`, `MISSING`, `RETIRED`
- `OrderStatus`: `SUBMITTED`, `APPROVED`, `ISSUED`, `RETURN_DECLARED`, `CLOSED`, `CANCELLED`, `EMERGENCY_ISSUED`
- `CheckinCondition`: `OK`, `NEEDS_REPAIR`, `BROKEN`, `MISSING`
- `IncidentType`: `DAMAGE`, `NEEDS_REPAIR`, `BROKEN`, `MISSING`, `SHORT_RETURN`, `OTHER`

## Key tables and purpose

- `users`: Telegram identity and role-based access.
- `items`: inventory units with type, stock, status, price/day, and location.
- `categories`, `item_categories`: item categorization (many-to-many).
- `kits`, `kit_lines`: template bundles that expand into order lines.
- `orders`: rental request header with date window, status flow, discount rate, emergency flag, and ownership.
- `order_lines`: requested/approved/issued quantities, discounted price snapshot, optional source kit link.
- `checkin_lines`: return results per order line with returned quantity and condition.
- `incidents`: accountability records for damage/missing/repair cases tied to item and order context.
- `item_images`, `incident_photos`: optional media storage links.

## Availability algorithm (dates only)

1. If `item.availability_status != ACTIVE`, available quantity is `0`.
2. For overlapping orders, include only active reservation statuses (`APPROVED`, `ISSUED`, `RETURN_DECLARED`, plus future active statuses if added).
3. Date overlap condition: `order.start_date < end_date` AND `order.end_date > start_date`.
4. Reserved quantity per line uses priority: `issued_qty` -> `approved_qty` -> `requested_qty`.
5. `SUBMITTED` orders do not reserve stock.
6. Compute `available = max(0, item.stock_total - reserved_qty_sum)`.
7. For `CONSUMABLE`, stock is decremented at issue (no manual check-in required).
8. For `BULK`, missing amount (`issued - returned`) is deducted during check-in.

## Order edit rule

- Greenwich can edit only own orders in `SUBMITTED`.
- After `APPROVED`, order editing is forbidden.
- `orders.updated_at` is used for warehouse queue "updated X minutes ago".
