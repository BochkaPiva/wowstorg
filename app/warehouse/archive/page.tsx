"use client";

import { useEffect, useMemo, useState } from "react";
import { checkinConditionLabel } from "@/lib/checkin-labels";

type ArchiveStatus = "ALL" | "CLOSED" | "CANCELLED";
type ArchiveSource = "ALL" | "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
type Customer = { id: string; name: string };

const CLIENT_DECLARATION_MARKER = "CLIENT_RETURN_DECLARATION_B64:";
const DECLARATION_HEADER = "Декларация клиента по возврату";

/** Только комментарий: без декларации по возврату и без B64. */
function notesCommentOnly(notes: string | null): string | null {
  if (!notes || !notes.trim()) return null;
  const idxB64 = notes.indexOf(CLIENT_DECLARATION_MARKER);
  const idxDecl = notes.indexOf(DECLARATION_HEADER);
  const cut = [idxB64 >= 0 ? idxB64 : notes.length, idxDecl >= 0 ? idxDecl : notes.length];
  const idx = Math.min(...cut);
  const text = notes.slice(0, idx).trim();
  return text.length > 0 ? text : null;
}

type ArchiveOrder = {
  id: string;
  status: "CLOSED" | "CANCELLED";
  orderSource: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  createdViaQuickIssue?: boolean;
  customerName: string | null;
  eventName: string | null;
  startDate: string;
  endDate: string;
  updatedAt: string;
  closedAt: string | null;
  totalAmount?: number;
  createdBy: { username: string | null; telegramId: string };
  notes: string | null;
  lines: Array<{
    id: string;
    itemId: string;
    itemName: string;
    requestedQty: number;
    approvedQty: number | null;
    issuedQty: number | null;
    returnedQty: number | null;
    pricePerDay: number | null;
    checkinLine?: {
      returnedQty: number;
      condition: string;
      comment: string | null;
      returnSegments: Array<{ condition: string; qty: number }> | null;
    } | null;
  }>;
};

function statusChip(status: ArchiveOrder["status"]): string {
  return status === "CLOSED"
    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
    : "bg-zinc-100 text-zinc-700 border-zinc-200";
}

export default function WarehouseArchivePage() {
  const [orders, setOrders] = useState<ArchiveOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [statusText, setStatusText] = useState("Загрузка фильтров...");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<ArchiveStatus>("ALL");
  const [source, setSource] = useState<ArchiveSource>("ALL");
  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadCustomers() {
      const response = await fetch("/api/customers?includeInactive=true");
      const payload = (await response.json()) as { customers?: Customer[]; error?: { message?: string } };
      if (!response.ok || !payload.customers) {
        if (!ignore) setStatusText(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить заказчиков."}`);
        return;
      }
      if (!ignore) {
        setCustomers(payload.customers);
        setStatusText("Архив готов.");
      }
    }
    void loadCustomers();
    return () => {
      ignore = true;
    };
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("status", status);
    params.set("source", source);
    if (startDate && endDate) {
      params.set("startDate", startDate);
      params.set("endDate", endDate);
    }
    if (customerId) params.set("customerId", customerId);
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [status, source, startDate, endDate, customerId, search]);

  async function loadArchive() {
    setLoading(true);
    setStatusText("Загрузка архива...");
    const response = await fetch(`/api/warehouse/archive?${queryString}`);
    const payload = (await response.json()) as { orders?: ArchiveOrder[]; error?: { message?: string } };
    if (!response.ok || !payload.orders) {
      setOrders([]);
      setStatusText(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить архив."}`);
      setLoading(false);
      return;
    }
    setOrders(payload.orders);
    setStatusText(`В архиве: ${payload.orders.length}.`);
    setLoading(false);
  }

  useEffect(() => {
    void loadArchive();
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Архив склада</h1>
        <div className="flex items-center gap-2">
          <button className="ws-btn" onClick={() => { globalThis.location.href = "/"; }}>
            Назад
          </button>
          <button className="ws-btn" onClick={() => { globalThis.location.href = `/api/warehouse/archive?${queryString}&format=csv`; }} disabled={loading}>
            CSV
          </button>
          <button className="ws-btn-primary" onClick={() => void loadArchive()} disabled={loading}>
            {loading ? "..." : "Обновить"}
          </button>
        </div>
      </div>

      <p className="text-sm text-[var(--muted)]">{statusText}</p>

      <div className="ws-card grid gap-3 p-3 md:grid-cols-3">
        <select className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as ArchiveStatus)}>
          <option value="ALL">Все статусы</option>
          <option value="CLOSED">Закрытые</option>
          <option value="CANCELLED">Отмененные</option>
        </select>
        <select className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={source} onChange={(e) => setSource(e.target.value as ArchiveSource)}>
          <option value="ALL">Все источники</option>
          <option value="GREENWICH_INTERNAL">GREENWICH_INTERNAL</option>
          <option value="WOWSTORG_EXTERNAL">WOWSTORG_EXTERNAL</option>
        </select>
        <select className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Все заказчики</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>{customer.name}</option>
          ))}
        </select>
        <input className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <input className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по заказчику / мероприятию / id" />
      </div>

      <div className="space-y-3">
        {orders.map((order) => (
          <article key={order.id} className="ws-card p-4">
            {/* Компактное превью: без состава и суммы */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{order.customerName ?? "Без заказчика"}</span>
                  {order.eventName ? <span className="text-sm text-[var(--muted)]">• {order.eventName}</span> : null}
                  {order.createdViaQuickIssue ? (
                    <span className="rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                      Быстрая выдача
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {order.startDate} — {order.endDate} • {order.orderSource}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Коллега: {order.createdBy.username ?? `ID ${order.createdBy.telegramId}`}
                  {" • "}
                  Обновлено: {new Date(order.updatedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {order.closedAt ? ` • Закрыто: ${new Date(order.closedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusChip(order.status)}`}>
                  {order.status === "CLOSED" ? "Закрыта" : "Отменена"}
                </span>
                <button className="ws-btn" onClick={() => setExpandedOrderId((prev) => (prev === order.id ? null : order.id))}>
                  {expandedOrderId === order.id ? "Скрыть детали" : "Открыть детали"}
                </button>
              </div>
            </div>

            {/* Подробные детали при раскрытии */}
            {expandedOrderId === order.id ? (
              <div className="mt-4 space-y-4 rounded-xl border border-[var(--border)] bg-slate-50/80 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-[var(--border)] bg-white p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Заказчик</div>
                    <div className="mt-1 text-sm font-medium">{order.customerName ?? "—"}</div>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-white p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Мероприятие</div>
                    <div className="mt-1 text-sm font-medium">{order.eventName ?? "—"}</div>
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-white p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Период аренды</div>
                  <div className="mt-1 text-sm">{order.startDate} — {order.endDate}</div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-white p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Выдано по заявке</div>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                    {order.lines.map((line) => {
                      const qty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
                      return (
                        <li key={line.id} className="flex justify-between gap-2 border-b border-[var(--border)] pb-1 last:border-0">
                          <span className="min-w-0 truncate">{line.itemName}</span>
                          <span className="flex-shrink-0 font-medium">×{qty}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-white p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Принято при сдаче</div>
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
                    {order.lines.map((line) => {
                      const issued = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
                      const cl = line.checkinLine;
                      if (!cl) {
                        return (
                          <li key={line.id} className="flex justify-between gap-2 border-b border-[var(--border)] pb-1 last:border-0">
                            <span className="min-w-0 truncate">{line.itemName}</span>
                            <span className="flex-shrink-0 text-[var(--muted)]">—</span>
                          </li>
                        );
                      }
                      const segments = cl.returnSegments && Array.isArray(cl.returnSegments) && cl.returnSegments.length > 0
                        ? cl.returnSegments.map((s) => `${s.qty} шт — ${checkinConditionLabel(s.condition as "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING")}`).join(", ")
                        : `${cl.returnedQty} шт — ${checkinConditionLabel(cl.condition as "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING")}`;
                      return (
                        <li key={line.id} className="border-b border-[var(--border)] pb-1 last:border-0">
                          <div className="flex justify-between gap-2">
                            <span className="min-w-0 truncate font-medium">{line.itemName}</span>
                            <span className="flex-shrink-0 text-right text-xs">{cl.returnedQty} из {issued}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-[var(--muted)]">{segments}{cl.comment ? ` • ${cl.comment}` : ""}</div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {order.totalAmount != null && order.totalAmount > 0 ? (
                  <div className="rounded-lg border border-[var(--border)] bg-white p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Сумма</div>
                    <div className="mt-1 text-lg font-semibold text-[var(--brand)]">{order.totalAmount.toLocaleString("ru-RU")} ₽</div>
                  </div>
                ) : null}
                {notesCommentOnly(order.notes) ? (
                  <div className="rounded-lg border border-[var(--border)] bg-white p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Комментарий</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm">{notesCommentOnly(order.notes)}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
        {orders.length === 0 ? <div className="ws-card p-6 text-center text-sm text-[var(--muted)]">По текущим фильтрам архив пуст.</div> : null}
      </div>
    </section>
  );
}
