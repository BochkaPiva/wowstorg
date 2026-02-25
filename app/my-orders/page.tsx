"use client";

import { useEffect, useMemo, useState } from "react";

type OrderLine = {
  id: string;
  itemId: string;
  itemName: string;
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
  totalAmount?: number;
  updatedAt: string;
  lines: OrderLine[];
  deliveryRequested?: boolean;
  deliveryComment?: string | null;
  mountRequested?: boolean;
  mountComment?: string | null;
  dismountRequested?: boolean;
  dismountComment?: string | null;
};
type EditableOrderDetails = {
  id: string;
  startDate: string;
  endDate: string;
  customerName: string | null;
  eventName: string | null;
  notes: string | null;
  lines: Array<{ id: string; itemId: string; requestedQty: number; item: { name: string } }>;
};

type ReturnCondition = "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";
type ReturnDraft = Record<string, { returnedQty: number; condition: ReturnCondition; comment: string }>;

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
  const [expandedEditOrderId, setExpandedEditOrderId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<
    Record<string, { startDate: string; endDate: string; eventName: string; notes: string; lines: Array<{ itemId: string; itemName: string; requestedQty: number }> }>
  >({});
  const [editItems, setEditItems] = useState<Record<string, { id: string; name: string }[]>>({});
  const [newLineDraft, setNewLineDraft] = useState<Record<string, { itemId: string; qty: number }>>({});

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

  async function cancelOrder(order: Order) {
    if (order.status !== "SUBMITTED") return;
    if (!confirm("Отменить заявку? Она попадёт в архив как отменённая.")) return;
    setBusyOrderId(order.id);
    try {
      const response = await fetch(`/api/orders/${order.id}/cancel`, { method: "POST" });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setStatus(payload.error?.message ?? "Не удалось отменить заявку.");
        return;
      }
      setStatus("Заявка отменена.");
      await loadOrders();
    } catch {
      setStatus("Ошибка сети при отмене.");
    } finally {
      setBusyOrderId(null);
    }
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
        draft[line.id] = { returnedQty: issuedQty, condition: "OK", comment: "" };
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
    const lines = Object.entries(draft).map(([orderLineId, value]) => ({
        orderLineId,
        returnedQty: value.returnedQty,
        condition: value.condition,
        comment: value.comment.trim() || undefined,
      }));

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

  async function openEdit(order: Order) {
    if (order.status !== "SUBMITTED") return;
    if (!editDrafts[order.id]) {
      const [orderRes, itemsRes] = await Promise.all([
        fetch(`/api/orders/${order.id}`),
        fetch(`/api/items?startDate=${order.startDate}&endDate=${order.endDate}&limit=300`),
      ]);
      const orderPayload = (await orderRes.json()) as { order?: EditableOrderDetails; error?: { message?: string } };
      if (!orderRes.ok || !orderPayload.order) {
        setStatus(`Ошибка: ${orderPayload.error?.message ?? "Не удалось загрузить заявку для редактирования."}`);
        return;
      }
      setEditDrafts((prev) => ({
        ...prev,
        [order.id]: {
          startDate: orderPayload.order!.startDate,
          endDate: orderPayload.order!.endDate,
          eventName: orderPayload.order!.eventName ?? "",
          notes: orderPayload.order!.notes ?? "",
          lines: orderPayload.order!.lines.map((line) => ({
            itemId: line.itemId,
            itemName: line.item.name,
            requestedQty: line.requestedQty,
          })),
        },
      }));
      if (itemsRes.ok) {
        const itemsPayload = (await itemsRes.json()) as { items?: { id: string; name: string }[] };
        setEditItems((prev) => ({
          ...prev,
          [order.id]: (itemsPayload.items ?? []).map((i) => ({ id: i.id, name: i.name })),
        }));
      }
      setNewLineDraft((prev) => ({ ...prev, [order.id]: { itemId: "", qty: 1 } }));
    }
    setExpandedEditOrderId((prev) => (prev === order.id ? null : order.id));
  }

  async function saveEdit(order: Order) {
    const draft = editDrafts[order.id];
    if (!draft || draft.lines.length === 0) {
      setStatus("В заявке должна быть хотя бы одна позиция.");
      return;
    }
    setBusyOrderId(order.id);
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: draft.startDate,
          endDate: draft.endDate,
          eventName: draft.eventName.trim() || null,
          notes: draft.notes.trim() || null,
          lines: draft.lines.map((line) => ({
            itemId: line.itemId,
            requestedQty: line.requestedQty,
          })),
        }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось сохранить правки."}`);
        return;
      }
      setStatus("Заявка обновлена.");
      setExpandedEditOrderId(null);
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
                  Обновлено: {new Date(order.updatedAt).toLocaleString("ru-RU")}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Состав: {order.lines.slice(0, 3).map((line) => `${line.itemName} x${line.requestedQty}`).join(", ")}
                  {order.lines.length > 3 ? ` +${order.lines.length - 3}` : ""}
                </div>
                {order.totalAmount != null && order.totalAmount > 0 ? (
                  <div className="text-sm font-medium text-[var(--brand)]">
                    Сумма: {order.totalAmount.toLocaleString("ru-RU")} ₽
                  </div>
                ) : null}
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
                {order.status === "SUBMITTED" ? (
                  <div className="flex gap-2">
                    <button className="ws-btn" onClick={() => void openEdit(order)}>
                      {expandedEditOrderId === order.id ? "Скрыть редактирование" : "Редактировать заявку"}
                    </button>
                    <button
                      className="ws-btn disabled:opacity-50"
                      onClick={() => void cancelOrder(order)}
                      disabled={busyOrderId !== null}
                      title="Отменить заявку (попадёт в архив)"
                    >
                      Отменить заявку
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {expandedEditOrderId === order.id ? (
              <div className="mt-3 space-y-3 rounded-xl border border-[var(--border)] bg-white p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-[var(--muted)]">
                    Дата начала
                    <input
                      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                      type="date"
                      value={editDrafts[order.id]?.startDate ?? order.startDate}
                      onChange={(event) =>
                        setEditDrafts((prev) => ({
                          ...prev,
                          [order.id]: { ...prev[order.id], startDate: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="block text-xs font-medium text-[var(--muted)]">
                    Дата окончания
                    <input
                      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                      type="date"
                      value={editDrafts[order.id]?.endDate ?? order.endDate}
                      onChange={(event) =>
                        setEditDrafts((prev) => ({
                          ...prev,
                          [order.id]: { ...prev[order.id], endDate: event.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="block text-xs font-medium text-[var(--muted)]">
                  Мероприятие
                  <input
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                    value={editDrafts[order.id]?.eventName ?? ""}
                    onChange={(event) =>
                      setEditDrafts((prev) => ({
                        ...prev,
                        [order.id]: { ...prev[order.id], eventName: event.target.value },
                      }))
                    }
                    placeholder="Название мероприятия"
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--muted)]">
                  Комментарий
                  <input
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                    value={editDrafts[order.id]?.notes ?? ""}
                    onChange={(event) =>
                      setEditDrafts((prev) => ({
                        ...prev,
                        [order.id]: { ...prev[order.id], notes: event.target.value },
                      }))
                    }
                    placeholder="Комментарий к заявке"
                  />
                </label>
                {(order.deliveryRequested || order.mountRequested || order.dismountRequested) ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/10 p-3">
                    <div className="mb-1 text-xs font-medium text-[var(--muted)]">
                      Доп. услуги (нельзя изменить при редактировании)
                    </div>
                    <ul className="space-y-1 text-sm">
                      {order.deliveryRequested ? (
                        <li>Доставка: {order.deliveryComment?.trim() || "—"}</li>
                      ) : null}
                      {order.mountRequested ? (
                        <li>Монтаж: {order.mountComment?.trim() || "—"}</li>
                      ) : null}
                      {order.dismountRequested ? (
                        <li>Демонтаж: {order.dismountComment?.trim() || "—"}</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <div className="mb-1 text-xs font-medium text-[var(--muted)]">Состав</div>
                  <div className="space-y-2">
                    {(editDrafts[order.id]?.lines ?? []).map((line, idx) => (
                      <div key={`${line.itemId}-${idx}`} className="grid grid-cols-[1fr_80px_auto] items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1.5">
                        <span className="text-sm">{line.itemName}</span>
                        <input
                          className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-sm"
                          type="number"
                          min={1}
                          value={line.requestedQty}
                          onChange={(event) =>
                            setEditDrafts((prev) => ({
                              ...prev,
                              [order.id]: {
                                ...prev[order.id],
                                lines: prev[order.id].lines.map((entry, entryIdx) =>
                                  entryIdx === idx ? { ...entry, requestedQty: Math.max(1, Number(event.target.value)) } : entry,
                                ),
                              },
                            }))
                          }
                        />
                        <button
                          className="ws-btn text-xs"
                          type="button"
                          onClick={() =>
                            setEditDrafts((prev) => ({
                              ...prev,
                              [order.id]: {
                                ...prev[order.id],
                                lines: prev[order.id].lines.filter((_, entryIdx) => entryIdx !== idx),
                              },
                            }))
                          }
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-2">
                  <label className="min-w-0 flex-1 text-xs font-medium text-[var(--muted)]">
                    Добавить позицию
                    <div className="mt-1 flex gap-2">
                      <select
                        className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                        value={newLineDraft[order.id]?.itemId ?? ""}
                        onChange={(e) =>
                          setNewLineDraft((prev) => ({
                            ...prev,
                            [order.id]: { ...(prev[order.id] ?? { itemId: "", qty: 1 }), itemId: e.target.value },
                          }))
                        }
                      >
                        <option value="">— выбрать —</option>
                        {(editItems[order.id] ?? []).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="w-16 rounded-xl border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                        type="number"
                        min={1}
                        value={newLineDraft[order.id]?.qty ?? 1}
                        onChange={(e) =>
                          setNewLineDraft((prev) => ({
                            ...prev,
                            [order.id]: { ...(prev[order.id] ?? { itemId: "", qty: 1 }), qty: Math.max(1, Number(e.target.value)) },
                          }))
                        }
                      />
                      <button
                        className="ws-btn"
                        type="button"
                        disabled={!newLineDraft[order.id]?.itemId}
                        onClick={() => {
                          const draft = newLineDraft[order.id];
                          const itemId = draft?.itemId;
                          if (!itemId) return;
                          const item = (editItems[order.id] ?? []).find((i) => i.id === itemId);
                          if (!item) return;
                          setEditDrafts((prev) => ({
                            ...prev,
                            [order.id]: {
                              ...prev[order.id],
                              lines: [...prev[order.id].lines, { itemId, itemName: item.name, requestedQty: draft?.qty ?? 1 }],
                            },
                          }));
                          setNewLineDraft((prev) => ({ ...prev, [order.id]: { itemId: "", qty: 1 } }));
                        }}
                      >
                        Добавить
                      </button>
                    </div>
                  </label>
                </div>
                <div className="flex justify-end pt-1">
                  <button className="ws-btn-primary" onClick={() => void saveEdit(order)} disabled={busyOrderId !== null}>
                    Сохранить заявку
                  </button>
                </div>
              </div>
            ) : null}

            {expandedReturnOrderId === order.id ? (
              <div className="mt-3 space-y-2 rounded-xl border border-[var(--border)] bg-white p-3">
                {order.lines.map((line) => {
                  const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
                  const draft = returnDrafts[order.id]?.[line.id];
                  return (
                    <div key={line.id} className="rounded-xl border border-[var(--border)] p-2">
                      <div className="mb-1 text-sm">{line.itemName}</div>
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
