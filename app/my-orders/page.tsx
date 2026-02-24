"use client";

import { useEffect, useMemo, useState } from "react";

type OrderLine = {
  id: string;
  itemId: string;
  requestedQty: number;
  approvedQty: number | null;
  issuedQty: number | null;
};

type Order = {
  id: string;
  status: "SUBMITTED" | "APPROVED" | "ISSUED" | "RETURN_DECLARED" | "CLOSED" | "CANCELLED";
  customerName: string | null;
  eventName: string | null;
  orderSource: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  startDate: string;
  endDate: string;
  notes: string | null;
  updatedAt: string;
  lines: OrderLine[];
};

function statusText(status: Order["status"]): string {
  switch (status) {
    case "SUBMITTED":
      return "Новая";
    case "APPROVED":
      return "Согласована";
    case "ISSUED":
      return "Выдана";
    case "RETURN_DECLARED":
      return "Возврат заявлен";
    case "CLOSED":
      return "Закрыта";
    case "CANCELLED":
      return "Отменена";
    default:
      return status;
  }
}

function statusClass(status: Order["status"]): string {
  if (status === "SUBMITTED") return "bg-violet-100 text-violet-800 border-violet-200";
  if (status === "APPROVED") return "bg-indigo-100 text-indigo-800 border-indigo-200";
  if (status === "ISSUED") return "bg-sky-100 text-sky-800 border-sky-200";
  if (status === "RETURN_DECLARED") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "CLOSED") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  return "bg-zinc-100 text-zinc-700 border-zinc-200";
}

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState("Загрузка моих заявок...");

  async function loadOrders() {
    setStatus("Обновляем...");
    const response = await fetch("/api/orders/my");
    const payload = (await response.json()) as { orders?: Order[]; error?: { message?: string } };
    if (!response.ok || !payload.orders) {
      setOrders([]);
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить заявки."}`);
      return;
    }
    setOrders(payload.orders);
    setStatus(`Заявок: ${payload.orders.length}.`);
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  async function declareReturn(orderId: string) {
    setStatus("Отправляем возврат...");
    const response = await fetch(`/api/orders/${orderId}/return-declared`, { method: "POST" });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось отправить возврат."}`);
      return;
    }
    setStatus("Возврат отправлен.");
    await loadOrders();
  }

  const sorted = useMemo(
    () => [...orders].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [orders],
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Мои заявки</h1>
        <button className="ws-btn-primary" onClick={() => void loadOrders()}>
          Обновить
        </button>
      </div>

      <p className="text-sm text-[var(--muted)]">{status}</p>

      <div className="space-y-3">
        {sorted.map((order) => (
          <article key={order.id} className="ws-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="font-semibold">{order.customerName ?? "Без заказчика"} {order.eventName ? `• ${order.eventName}` : ""}</div>
                <div className="text-xs text-[var(--muted)]">
                  Даты: {order.startDate} - {order.endDate}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Источник: {order.orderSource} • обновлено: {new Date(order.updatedAt).toLocaleString("ru-RU")}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Состав: {order.lines.slice(0, 3).map((line) => `${line.itemId} x${line.requestedQty}`).join(", ")}
                  {order.lines.length > 3 ? ` +${order.lines.length - 3}` : ""}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass(order.status)}`}>
                  {statusText(order.status)}
                </span>
                {order.status === "ISSUED" ? (
                  <button className="ws-btn" onClick={() => void declareReturn(order.id)}>
                    Отправить на приемку
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
        {sorted.length === 0 ? (
          <div className="ws-card p-6 text-center text-sm text-[var(--muted)]">Пока нет заявок.</div>
        ) : null}
      </div>
    </section>
  );
}
