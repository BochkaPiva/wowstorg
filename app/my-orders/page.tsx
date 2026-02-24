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

type ReturnCondition = "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";
type ReturnDraft = Record<string, { checked: boolean; returnedQty: number; condition: ReturnCondition; comment: string }>;

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
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [expandedReturnOrderId, setExpandedReturnOrderId] = useState<string | null>(null);
  const [returnDrafts, setReturnDrafts] = useState<Record<string, ReturnDraft>>({});
  const [returnComments, setReturnComments] = useState<Record<string, string>>({});

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

  function ensureDraft(order: Order) {
    setReturnDrafts((prev) => {
      if (prev[order.id]) return prev;
      const draft: ReturnDraft = {};
      for (const line of order.lines) {
        const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
        draft[line.id] = { checked: true, returnedQty: issuedQty, condition: "OK", comment: "" };
      }
      return { ...prev, [order.id]: draft };
    });
  }

  async function declareReturnFast(order: Order) {
    setBusyOrderId(order.id);
    try {
      const lines = order.lines.map((line) => {
        const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
        return {
          orderLineId: line.id,
          returnedQty: issuedQty,
          condition: "OK" as const,
        };
      });
      const response = await fetch(`/api/orders/${order.id}/return-declared`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось отправить возврат."}`);
        return;
      }
      setStatus("Возврат отправлен на приемку.");
      setExpandedReturnOrderId(null);
      await loadOrders();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function declareReturnDetailed(order: Order) {
    const draft = returnDrafts[order.id];
    if (!draft) {
      setStatus("Сначала откройте форму возврата.");
      return;
    }
    const lines = Object.entries(draft)
      .filter(([, value]) => value.checked)
      .map(([orderLineId, value]) => ({
        orderLineId,
        returnedQty: value.returnedQty,
        condition: value.condition,
        comment: value.comment.trim() || undefined,
      }));
    if (lines.length === 0) {
      setStatus("Отметьте хотя бы одну позицию в форме возврата.");
      return;
    }

    setBusyOrderId(order.id);
    try {
      const response = await fetch(`/api/orders/${order.id}/return-declared`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          comment: returnComments[order.id]?.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось отправить возврат."}`);
        return;
      }
      setStatus("Возврат по позициям отправлен на приемку.");
      setExpandedReturnOrderId(null);
      await loadOrders();
    } finally {
      setBusyOrderId(null);
    }
  }

  const sorted = useMemo(
    () => [...orders].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [orders],
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Мои заявки</h1>
        <div className="flex items-center gap-2">
          <button className="ws-btn" onClick={() => { globalThis.location.href = "/"; }}>
            Назад
          </button>
          <button className="ws-btn-primary" onClick={() => void loadOrders()}>
            Обновить
          </button>
        </div>
      </div>

      <p className="text-sm text-[var(--muted)]">{status}</p>

      <div className="space-y-3">
        {sorted.map((order) => (
          <article key={order.id} className="ws-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="font-semibold">
                  {order.customerName ?? "Без заказчика"} {order.eventName ? `• ${order.eventName}` : ""}
                </div>
                <div className="text-xs text-[var(--muted)]">Даты: {order.startDate} - {order.endDate}</div>
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
                  <div className="flex gap-2">
                    <button className="ws-btn" onClick={() => void declareReturnFast(order)} disabled={busyOrderId !== null}>
                      Сдать все (ОК)
                    </button>
                    <button
                      className="ws-btn"
                      onClick={() => {
                        ensureDraft(order);
                        setExpandedReturnOrderId((prev) => (prev === order.id ? null : order.id));
                      }}
                    >
                      Возврат по позициям
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {expandedReturnOrderId === order.id ? (
              <div className="mt-3 space-y-2 rounded-xl border border-[var(--border)] bg-white p-3">
                {order.lines.map((line) => {
                  const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
                  const draft = returnDrafts[order.id]?.[line.id];
                  return (
                    <div key={line.id} className="rounded-xl border border-[var(--border)] p-2">
                      <label className="mb-1 inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft?.checked ?? true}
                          onChange={(event) =>
                            setReturnDrafts((prev) => ({
                              ...prev,
                              [order.id]: {
                                ...(prev[order.id] ?? {}),
                                [line.id]: { ...(prev[order.id]?.[line.id] ?? draft), checked: event.target.checked } as ReturnDraft[string],
                              },
                            }))
                          }
                        />
                        <span>{line.itemId}</span>
                      </label>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input
                          className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                          type="number"
                          min={0}
                          max={issuedQty}
                          value={draft?.returnedQty ?? issuedQty}
                          onChange={(event) =>
                            setReturnDrafts((prev) => ({
                              ...prev,
                              [order.id]: {
                                ...(prev[order.id] ?? {}),
                                [line.id]: {
                                  ...(prev[order.id]?.[line.id] ?? draft),
                                  returnedQty: Math.max(0, Math.min(issuedQty, Number(event.target.value))),
                                } as ReturnDraft[string],
                              },
                            }))
                          }
                        />
                        <select
                          className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                          value={draft?.condition ?? "OK"}
                          onChange={(event) =>
                            setReturnDrafts((prev) => ({
                              ...prev,
                              [order.id]: {
                                ...(prev[order.id] ?? {}),
                                [line.id]: {
                                  ...(prev[order.id]?.[line.id] ?? draft),
                                  condition: event.target.value as ReturnCondition,
                                } as ReturnDraft[string],
                              },
                            }))
                          }
                        >
                          <option value="OK">Нормальное</option>
                          <option value="NEEDS_REPAIR">Требуется ремонт</option>
                          <option value="BROKEN">Сломано</option>
                          <option value="MISSING">Не возвращено</option>
                        </select>
                        <input
                          className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                          value={draft?.comment ?? ""}
                          onChange={(event) =>
                            setReturnDrafts((prev) => ({
                              ...prev,
                              [order.id]: {
                                ...(prev[order.id] ?? {}),
                                [line.id]: {
                                  ...(prev[order.id]?.[line.id] ?? draft),
                                  comment: event.target.value,
                                } as ReturnDraft[string],
                              },
                            }))
                          }
                          placeholder="Комментарий"
                        />
                      </div>
                    </div>
                  );
                })}
                <input
                  className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                  value={returnComments[order.id] ?? ""}
                  onChange={(event) => setReturnComments((prev) => ({ ...prev, [order.id]: event.target.value }))}
                  placeholder="Общий комментарий по возврату"
                />
                <div className="flex justify-end">
                  <button className="ws-btn-primary" onClick={() => void declareReturnDetailed(order)} disabled={busyOrderId !== null}>
                    Отправить возврат
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
        {sorted.length === 0 ? (
          <div className="ws-card p-6 text-center text-sm text-[var(--muted)]">Пока нет заявок.</div>
        ) : null}
      </div>
    </section>
  );
}
