"use client";

import { useEffect, useMemo, useState } from "react";

type ArchiveStatus = "ALL" | "CLOSED" | "CANCELLED";
type ArchiveSource = "ALL" | "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
type Customer = { id: string; name: string };

type ArchiveOrder = {
  id: string;
  status: "CLOSED" | "CANCELLED";
  orderSource: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  customerName: string | null;
  eventName: string | null;
  startDate: string;
  endDate: string;
  updatedAt: string;
  closedAt: string | null;
  lines: Array<{ id: string; itemId: string; requestedQty: number }>;
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
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="font-semibold">{order.customerName ?? "Без заказчика"} {order.eventName ? `• ${order.eventName}` : ""}</div>
                <div className="text-xs text-[var(--muted)]">
                  {order.startDate} - {order.endDate} • {order.orderSource}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Обновлено: {new Date(order.updatedAt).toLocaleString("ru-RU")}
                  {order.closedAt ? ` • Закрыто: ${new Date(order.closedAt).toLocaleString("ru-RU")}` : ""}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Состав: {order.lines.slice(0, 3).map((line) => `${line.itemId} x${line.requestedQty}`).join(", ")}
                  {order.lines.length > 3 ? ` +${order.lines.length - 3}` : ""}
                </div>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusChip(order.status)}`}>
                {order.status === "CLOSED" ? "Закрыта" : "Отменена"}
              </span>
            </div>
          </article>
        ))}
        {orders.length === 0 ? <div className="ws-card p-6 text-center text-sm text-[var(--muted)]">По текущим фильтрам архив пуст.</div> : null}
      </div>
    </section>
  );
}
