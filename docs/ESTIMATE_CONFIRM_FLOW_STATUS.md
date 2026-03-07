# Флоу «Смета → Подтверждение гринвича → Согласование склада» — статус

## Что уже сделано (не потерялось)

### 1. Схема и миграция
- **prisma/schema.prisma**: в `Order` добавлены поля  
  `estimateSentAt`, `estimateSentSnapshot`, `greenwichConfirmedAt`, `greenwichConfirmedSnapshot`
- **Миграция**: `prisma/migrations/20260228120000_add_estimate_confirm_snapshots/migration.sql`

### 2. Логика и API
- **lib/order-estimate-flow.ts** — снимки, сравнение, дифф «было → стало», форматирование текста для склада
- **POST /api/orders/[id]/send-estimate** — склад отправляет смету (тот же payload, что и при согласовании: линии + цены услуг). Сохраняет approvedQty и цены, строит смету, шлёт гринвичу в Telegram, сохраняет снимок, сбрасывает подтверждение гринвича
- **POST /api/orders/[id]/confirm-estimate** — гринвич подтверждает смету. Сохраняет снимок, шлёт складу уведомление с диффом
- **POST /api/orders/[id]/approve** — перед согласованием проверяет: есть ли `greenwichConfirmedAt`, совпадает ли текущее состояние с `greenwichConfirmedSnapshot`. Если нет — 409 с понятным текстом. При успехе — как раньше, плюс итоговая смета гринвичу и `notifyGreenwichOrderApprovedWithEstimate`

### 3. Очередь склада (API)
- **GET /api/warehouse/queue** — в ответе по заявке есть `estimateSentAt`, `greenwichConfirmedAt`, `canApprove`. Для GREENWICH_INTERNAL: canApprove = true только если гринвич подтвердил и склад не менял позиции/услуги. Для WOWSTORG_EXTERNAL: canApprove = true при SUBMITTED (подтверждение гринвича не требуется).

### 4. Уведомления (lib/notifications.ts)
- `notifyGreenwichEstimateSent` — «Склад отправил смету по заявке… Подтвердите в «Мои заявки»»
- `notifyGreenwichEstimateUpdated` — «Склад обновил смету… Подтвердите заново»
- `notifyWarehouseGreenwichConfirmed` — «Гринвич подтвердил смету… Изменения: … Дальше: Согласовано или снова Отправить смету»
- `notifyGreenwichOrderApprovedWithEstimate` — «Заявка согласована и укомплектована. Итоговая смета во вложении»

### 5. «Мои заявки» (API)
- **GET /api/orders/my** — в объекте заявки отдаются `estimateSentAt`, `greenwichConfirmedAt`

---

## Доработки (выполнено)

### 1. Очередь склада (UI) — app/warehouse/queue/page.tsx
- Тип `QueueOrder`: добавлены `estimateSentAt`, `greenwichConfirmedAt`, `canApprove`.
- Кнопка **«Отправить смету»**: вызывает `POST /api/orders/[id]/send-estimate` с тем же телом, что и согласование (общий `buildApprovePayload`). Неактивна, пока не заполнены цены на запрошенные доп. услуги.
- Кнопка **«Согласовать»**: неактивна при `!order.canApprove`; tooltip объясняет причину (гринвич не подтвердил или склад менял после подтверждения).

### 2. Мои заявки (UI) — app/my-orders/page.tsx
- Тип `Order`: добавлены `estimateSentAt`, `greenwichConfirmedAt`.
- Кнопка **«Подтвердить смету»**: показывается при `estimateSentAt && !greenwichConfirmedAt`, вызов `POST /api/orders/[id]/confirm-estimate`.
- После подтверждения: кнопка «Редактировать» заменена на текст «Смета подтверждена», форма редактирования не открывается; при открытой форме показывается подсказка. «Отменить» по-прежнему доступна.

### 3. Внешние заявки (WOWSTORG_EXTERNAL)
- В **queue** API и в **approve** API проверка подтверждения гринвича выполняется только для `orderSource === "GREENWICH_INTERNAL"`. Для внешних заявок «Согласовать» доступно без отправки/подтверждения сметы.
