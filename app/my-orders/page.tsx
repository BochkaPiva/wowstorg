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
  readyByDate?: string;
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
  readyByDate?: string;
  customerName: string | null;
  eventName: string | null;
  notes: string | null;
  lines: Array<{ id: string; itemId: string; requestedQty: number; item: { name: string } }>;
  deliveryRequested?: boolean;
  deliveryComment?: string | null;
  mountRequested?: boolean;
  mountComment?: string | null;
  dismountRequested?: boolean;
  dismountComment?: string | null;
};

type ReturnCondition = "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";
type ReturnSegment = { condition: ReturnCondition; qty: number };
/** По позиции: массив сегментов (сумма qty = выданному), комментарий. */
type ReturnDraft = Record<string, { segments: ReturnSegment[]; comment: string }>;

const ALL_CONDITIONS: ReturnCondition[] = ["OK", "NEEDS_REPAIR", "BROKEN", "MISSING"];
function conditionLabel(c: ReturnCondition): string {
  if (c === "OK") return "Нормально";
  if (c === "NEEDS_REPAIR") return "Требует ремонта";
  if (c === "BROKEN") return "Сломано";
  return "Не возвращено";
}

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
  const [returnQtyEdit, setReturnQtyEdit] = useState<Record<string, string>>({});
  const [returnComments, setReturnComments] = useState<Record<string, string>>({});
  const [expandedEditOrderId, setExpandedEditOrderId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<
    Record<
      string,
      {
        startDate: string;
        endDate: string;
        readyByDate: string;
        eventName: string;
        notes: string;
        lines: Array<{ itemId: string; itemName: string; requestedQty: number }>;
        deliveryRequested: boolean;
        deliveryComment: string;
        mountRequested: boolean;
        mountComment: string;
        dismountRequested: boolean;
        dismountComment: string;
      }
    >
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
        draft[line.id] = { segments: [{ condition: "OK", qty: issuedQty }], comment: "" };
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
    const lines = order.lines.map((line) => {
      const value = draft[line.id];
      if (!value?.segments?.length) return null;
      const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
      const sum = value.segments.reduce((a, s) => a + s.qty, 0);
      if (sum !== issuedQty) return null;
      return {
        orderLineId: line.id,
        returnedQty: value.segments[0]!.qty,
        condition: value.segments[0]!.condition,
        comment: value.comment.trim() || undefined,
        segments: value.segments,
      };
    }).filter(Boolean) as Array<{ orderLineId: string; returnedQty: number; condition: ReturnCondition; comment?: string; segments: ReturnSegment[] }>;

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
      const o = orderPayload.order!;
      setEditDrafts((prev) => ({
        ...prev,
        [order.id]: {
          startDate: o.startDate,
          endDate: o.endDate,
          readyByDate: o.readyByDate ?? o.startDate,
          eventName: o.eventName ?? "",
          notes: o.notes ?? "",
          lines: o.lines.map((line) => ({
            itemId: line.itemId,
            itemName: line.item.name,
            requestedQty: line.requestedQty,
          })),
          deliveryRequested: o.deliveryRequested ?? false,
          deliveryComment: o.deliveryComment?.trim() ?? "",
          mountRequested: o.mountRequested ?? false,
          mountComment: o.mountComment?.trim() ?? "",
          dismountRequested: o.dismountRequested ?? false,
          dismountComment: o.dismountComment?.trim() ?? "",
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
          readyByDate: draft.readyByDate ?? order.readyByDate ?? order.startDate,
          eventName: draft.eventName.trim() || null,
          notes: draft.notes.trim() || null,
          lines: draft.lines.map((line) => ({
            itemId: line.itemId,
            requestedQty: line.requestedQty,
          })),
          deliveryRequested: draft.deliveryRequested ?? order.deliveryRequested ?? false,
          deliveryComment: (draft.deliveryComment ?? order.deliveryComment ?? "").trim() || null,
          mountRequested: draft.mountRequested ?? order.mountRequested ?? false,
          mountComment: (draft.mountComment ?? order.mountComment ?? "").trim() || null,
          dismountRequested: draft.dismountRequested ?? order.dismountRequested ?? false,
          dismountComment: (draft.dismountComment ?? order.dismountComment ?? "").trim() || null,
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
                <div className="text-xs text-[var(--muted)]">Даты: {order.startDate} — {order.endDate}{order.readyByDate && order.readyByDate !== order.startDate ? ` • Готовность к: ${order.readyByDate}` : ""}</div>
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
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block min-w-0 text-xs font-medium text-[var(--muted)]">
                    Дата начала
                    <input
                      className="mt-1 w-full min-w-0 rounded-xl border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                      type="date"
                      value={editDrafts[order.id]?.startDate ?? order.startDate}
                      onChange={(event) => {
                        const v = event.target.value;
                        setEditDrafts((prev) => {
                          const next = { ...prev, [order.id]: { ...prev[order.id], startDate: v } };
                          if ((next[order.id].readyByDate ?? order.readyByDate ?? order.startDate) > v)
                            next[order.id].readyByDate = v;
                          return next;
                        });
                      }}
                    />
                  </label>
                  <label className="block min-w-0 text-xs font-medium text-[var(--muted)]">
                    Дата окончания
                    <input
                      className="mt-1 w-full min-w-0 rounded-xl border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
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
                  <label className="block min-w-0 text-xs font-medium text-[var(--muted)]">
                    Готовность к дате (когда подготовить и когда заберут/отправят)
                    <input
                      className="mt-1 w-full min-w-0 rounded-xl border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                      type="date"
                      max={editDrafts[order.id]?.startDate ?? order.startDate}
                      value={editDrafts[order.id]?.readyByDate ?? order.readyByDate ?? order.startDate}
                      onChange={(event) =>
                        setEditDrafts((prev) => ({
                          ...prev,
                          [order.id]: { ...prev[order.id], readyByDate: event.target.value },
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
                <div className="rounded-xl border border-[var(--border)] bg-white p-3">
                  <div className="mb-2 text-xs font-medium text-[var(--muted)]">Доп. услуги</div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm w-20">Доставка</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={editDrafts[order.id]?.deliveryRequested ?? order.deliveryRequested ?? false}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:ring-offset-2 ${
                          editDrafts[order.id]?.deliveryRequested ?? order.deliveryRequested
                            ? "bg-[var(--brand)]"
                            : "bg-gray-200"
                        }`}
                        onClick={() =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [order.id]: {
                              ...prev[order.id],
                              deliveryRequested: !(prev[order.id]?.deliveryRequested ?? order.deliveryRequested ?? false),
                              deliveryComment: prev[order.id]?.deliveryComment ?? order.deliveryComment ?? "",
                              mountRequested: prev[order.id]?.mountRequested ?? order.mountRequested ?? false,
                              mountComment: prev[order.id]?.mountComment ?? order.mountComment ?? "",
                              dismountRequested: prev[order.id]?.dismountRequested ?? order.dismountRequested ?? false,
                              dismountComment: prev[order.id]?.dismountComment ?? order.dismountComment ?? "",
                            },
                          }))
                        }
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                            editDrafts[order.id]?.deliveryRequested ?? order.deliveryRequested ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      {(editDrafts[order.id]?.deliveryRequested ?? order.deliveryRequested) ? (
                        <input
                          className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                          placeholder="Куда, когда"
                          value={editDrafts[order.id]?.deliveryComment ?? order.deliveryComment ?? ""}
                          onChange={(e) =>
                            setEditDrafts((prev) => ({
                              ...prev,
                              [order.id]: { ...prev[order.id], deliveryComment: e.target.value },
                            }))
                          }
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm w-20">Монтаж</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={editDrafts[order.id]?.mountRequested ?? order.mountRequested ?? false}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:ring-offset-2 ${
                          editDrafts[order.id]?.mountRequested ?? order.mountRequested ? "bg-[var(--brand)]" : "bg-gray-200"
                        }`}
                        onClick={() =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [order.id]: {
                              ...prev[order.id],
                              deliveryRequested: prev[order.id]?.deliveryRequested ?? order.deliveryRequested ?? false,
                              deliveryComment: prev[order.id]?.deliveryComment ?? order.deliveryComment ?? "",
                              mountRequested: !(prev[order.id]?.mountRequested ?? order.mountRequested ?? false),
                              mountComment: prev[order.id]?.mountComment ?? order.mountComment ?? "",
                              dismountRequested: prev[order.id]?.dismountRequested ?? order.dismountRequested ?? false,
                              dismountComment: prev[order.id]?.dismountComment ?? order.dismountComment ?? "",
                            },
                          }))
                        }
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                            editDrafts[order.id]?.mountRequested ?? order.mountRequested ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      {(editDrafts[order.id]?.mountRequested ?? order.mountRequested) ? (
                        <input
                          className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                          placeholder="Где, когда"
                          value={editDrafts[order.id]?.mountComment ?? order.mountComment ?? ""}
                          onChange={(e) =>
                            setEditDrafts((prev) => ({
                              ...prev,
                              [order.id]: { ...prev[order.id], mountComment: e.target.value },
                            }))
                          }
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm w-20">Демонтаж</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={editDrafts[order.id]?.dismountRequested ?? order.dismountRequested ?? false}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:ring-offset-2 ${
                          editDrafts[order.id]?.dismountRequested ?? order.dismountRequested ? "bg-[var(--brand)]" : "bg-gray-200"
                        }`}
                        onClick={() =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [order.id]: {
                              ...prev[order.id],
                              deliveryRequested: prev[order.id]?.deliveryRequested ?? order.deliveryRequested ?? false,
                              deliveryComment: prev[order.id]?.deliveryComment ?? order.deliveryComment ?? "",
                              mountRequested: prev[order.id]?.mountRequested ?? order.mountRequested ?? false,
                              mountComment: prev[order.id]?.mountComment ?? order.mountComment ?? "",
                              dismountRequested: !(prev[order.id]?.dismountRequested ?? order.dismountRequested ?? false),
                              dismountComment: prev[order.id]?.dismountComment ?? order.dismountComment ?? "",
                            },
                          }))
                        }
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                            editDrafts[order.id]?.dismountRequested ?? order.dismountRequested ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      {(editDrafts[order.id]?.dismountRequested ?? order.dismountRequested) ? (
                        <input
                          className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                          placeholder="Где, когда"
                          value={editDrafts[order.id]?.dismountComment ?? order.dismountComment ?? ""}
                          onChange={(e) =>
                            setEditDrafts((prev) => ({
                              ...prev,
                              [order.id]: { ...prev[order.id], dismountComment: e.target.value },
                            }))
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
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
              <div className="mt-3 space-y-3 rounded-xl border border-[var(--border)] bg-white p-3">
                <details className="rounded-xl border border-[var(--border)] bg-slate-50 p-2">
                  <summary className="cursor-pointer text-sm font-medium text-[var(--brand)]">Легенда по статусам</summary>
                  <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                    <li><strong>Нормально</strong> — все вернули в товарном виде</li>
                    <li><strong>Требует ремонта</strong> — товар с исправимым дефектом</li>
                    <li><strong>Сломано</strong> — сильно сломано, трудновосстановимо</li>
                    <li><strong>Не возвращено</strong> — не вернули</li>
                  </ul>
                </details>
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-2 text-xs text-[var(--muted)]">
                  <strong className="text-[var(--fg)]">Как разделить по статусам:</strong> выберите статус и введите количество. Для оставшихся штук появится следующий блок — в нём будут только ещё не выбранные статусы. Пример: 5 колонок — 2 сломано, 1 потеряна, 2 в порядке: первый статус «Сломано», кол-во 2; во втором блоке «Не возвращено», кол-во 1; в третьем оставшиеся 2 — «Нормально».
                </div>
                {order.lines.map((line) => {
                  const issuedQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
                  const draft = returnDrafts[order.id]?.[line.id];
                  const segments = draft?.segments ?? [{ condition: "OK" as ReturnCondition, qty: issuedQty }];
                  const normalize = (seg: ReturnSegment[]) => {
                    const out = [...seg];
                    let sum = 0;
                    for (let i = 0; i < out.length - 1; i++) {
                      sum += out[i]!.qty;
                    }
                    const last = out[out.length - 1]!;
                    last.qty = Math.max(0, issuedQty - sum);
                    if (last.qty === 0 && out.length > 1) out.pop();
                    const total = out.reduce((a, s) => a + s.qty, 0);
                    if (total < issuedQty) out.push({ condition: "OK" as ReturnCondition, qty: issuedQty - total });
                    return out;
                  };
                  const setSegments = (next: ReturnSegment[]) => {
                    setReturnDrafts((prev) => ({
                      ...prev,
                      [order.id]: {
                        ...(prev[order.id] ?? {}),
                        [line.id]: { segments: normalize(next), comment: draft?.comment ?? "" },
                      },
                    }));
                  };
                  const updateSeg = (i: number, patch: Partial<ReturnSegment>) => {
                    const next = segments.map((s, j) => j === i ? { ...s, ...patch } : s);
                    if (patch.condition !== undefined && patch.condition !== "OK" && issuedQty > 1 && next.length === 1) {
                      next[0]!.qty = 1;
                      next.push({ condition: "OK", qty: issuedQty - 1 });
                    }
                    setSegments(next);
                  };
                  const updateSegQty = (i: number, raw: string) => {
                    const v = raw.trim() === "" ? 0 : parseInt(raw, 10);
                    const sumBefore = segments.slice(0, i).reduce((a, s) => a + s.qty, 0);
                    const maxQty = issuedQty - sumBefore;
                    const qty = Number.isFinite(v) ? Math.max(0, Math.min(maxQty, v)) : segments[i]!.qty;
                    const next = segments.slice(0, i + 1).map((s, j) => j === i ? { ...s, qty } : s);
                    const remainder = issuedQty - (sumBefore + qty);
                    if (remainder > 0) {
                      next.push({ condition: (segments[i + 1]?.condition ?? "OK") as ReturnCondition, qty: remainder });
                    }
                    setSegments(normalize(next));
                    setReturnQtyEdit((prev) => {
                      const key = `${order.id}-${line.id}-${i}`;
                      const nextEdit = { ...prev };
                      delete nextEdit[key];
                      return nextEdit;
                    });
                  };
                  return (
                    <div key={line.id} className="rounded-xl border border-[var(--border)] p-2">
                      <div className="mb-2 text-sm font-medium">{line.itemName}</div>
                      <div className="mb-2 text-xs text-[var(--muted)]">Выдано: <strong className="text-[var(--fg)]">{issuedQty} шт</strong></div>
                      <div className="space-y-2">
                        {segments.map((seg, i) => {
                          const sumBefore = segments.slice(0, i).reduce((a, s) => a + s.qty, 0);
                          const usedConditions = segments.slice(0, i).map((s) => s.condition);
                          const availableConditions = ALL_CONDITIONS.filter((c) => !usedConditions.includes(c));
                          const showQty = issuedQty > 1 && (segments.length > 1 || seg.condition !== "OK");
                          const qtyEditKey = `${order.id}-${line.id}-${i}`;
                          const inputVal = returnQtyEdit[qtyEditKey] !== undefined ? returnQtyEdit[qtyEditKey] : String(seg.qty);
                          return (
                            <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50/80 p-2">
                              {i > 0 ? (
                                <span className="text-xs text-[var(--muted)]">Остальное: {issuedQty - sumBefore} шт →</span>
                              ) : null}
                              <label className="flex flex-col gap-0.5 text-xs text-[var(--muted)]">
                                {i + 1}-й статус
                                <select
                                  className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                                  value={seg.condition}
                                  onChange={(e) => updateSeg(i, { condition: e.target.value as ReturnCondition })}
                                >
                                  {availableConditions.map((c) => (
                                    <option key={c} value={c}>{conditionLabel(c)}</option>
                                  ))}
                                </select>
                              </label>
                              {showQty ? (
                                <label className="flex flex-col gap-0.5 text-xs text-[var(--muted)]">
                                  Кол-во, шт
                                  <input
                                    className="w-16 rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm text-center tabular-nums"
                                    type="text"
                                    inputMode="numeric"
                                    value={inputVal}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/\D/g, "");
                                      setReturnQtyEdit((prev) => ({ ...prev, [qtyEditKey]: v }));
                                    }}
                                    onBlur={() => updateSegQty(i, inputVal)}
                                    onKeyDown={(e) => e.key === "Enter" && updateSegQty(i, inputVal)}
                                  />
                                </label>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      <label className="mt-2 flex flex-col gap-0.5 text-xs text-[var(--muted)]">
                        Комментарий
                        <input
                          className="rounded-xl border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                          value={draft?.comment ?? ""}
                          onChange={(e) =>
                            setReturnDrafts((prev) => ({
                              ...prev,
                              [order.id]: {
                                ...(prev[order.id] ?? {}),
                                [line.id]: { segments: draft?.segments ?? segments, comment: e.target.value },
                              },
                            }))
                          }
                          placeholder="По желанию"
                        />
                      </label>
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
