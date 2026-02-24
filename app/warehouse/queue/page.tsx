"use client";

import { useEffect, useMemo, useState } from "react";

type QueueLine = {
  id: string;
  itemId: string;
  itemName: string;
  itemType: "ASSET" | "BULK" | "CONSUMABLE";
  requestedQty: number;
  approvedQty: number | null;
  issuedQty: number | null;
};

type CheckinCondition = "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";

type QueueOrder = {
  id: string;
  status: "SUBMITTED" | "APPROVED" | "ISSUED" | "RETURN_DECLARED" | "CLOSED" | "CANCELLED";
  isEmergency: boolean;
  orderSource: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  customerName: string | null;
  eventName: string | null;
  updatedMinutesAgo: number;
  startDate: string;
  endDate: string;
  notes: string | null;
  createdBy: { username: string | null; telegramId: string };
  lines: QueueLine[];
};

type ApproveDraftByLine = Record<string, { approvedQty: number; comment: string }>;
type IssueDraftByLine = Record<string, number>;
type CheckinDraftByLine = Record<string, { checked: boolean; returnedQty: number; condition: CheckinCondition; comment: string }>;
type EditDraft = { lines: Array<{ itemId: string; itemName: string; requestedQty: number }>; reason: string };
type ItemOption = { id: string; name: string; availableQty: number };

const STATUS_PRIORITY: Record<QueueOrder["status"], number> = {
  SUBMITTED: 0,
  APPROVED: 1,
  RETURN_DECLARED: 2,
  ISSUED: 3,
  CLOSED: 4,
  CANCELLED: 5,
};

function statusText(status: QueueOrder["status"]): string {
  switch (status) {
    case "SUBMITTED":
      return "Новая";
    case "APPROVED":
      return "Согласована";
    case "ISSUED":
      return "В аренде";
    case "RETURN_DECLARED":
      return "Ожидает приемки";
    case "CLOSED":
      return "Закрыта";
    case "CANCELLED":
      return "Отменена";
    default:
      return status;
  }
}

function cardClass(status: QueueOrder["status"]): string {
  if (status === "SUBMITTED") return "bg-violet-50 border-violet-200";
  if (status === "APPROVED") return "bg-indigo-50 border-indigo-200";
  if (status === "RETURN_DECLARED") return "bg-amber-50 border-amber-200";
  if (status === "ISSUED") return "bg-slate-50 border-slate-200";
  return "bg-white border-zinc-200";
}

function previewLines(lines: QueueLine[]): string {
  const items = lines.slice(0, 3).map((line) => `${line.itemName} x${line.requestedQty}`);
  const extra = lines.length > 3 ? ` +${lines.length - 3}` : "";
  return `${items.join(", ")}${extra}`;
}

export default function WarehouseQueuePage() {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [status, setStatus] = useState("Загружаем заявки...");
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [expandedCheckinOrderId, setExpandedCheckinOrderId] = useState<string | null>(null);

  const [approveDrafts, setApproveDrafts] = useState<Record<string, ApproveDraftByLine>>({});
  const [issueDrafts, setIssueDrafts] = useState<Record<string, IssueDraftByLine>>({});
  const [warehouseComments, setWarehouseComments] = useState<Record<string, string>>({});
  const [checkinDrafts, setCheckinDrafts] = useState<Record<string, CheckinDraftByLine>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, EditDraft>>({});
  const [itemOptionsByOrder, setItemOptionsByOrder] = useState<Record<string, ItemOption[]>>({});
  const [newLineByOrder, setNewLineByOrder] = useState<Record<string, { itemId: string; qty: number }>>({});

  async function loadQueue() {
    setStatus("Обновляем очередь...");
    const response = await fetch("/api/warehouse/queue");
    const payload = (await response.json()) as { orders?: QueueOrder[]; error?: { message?: string } };
    if (!response.ok || !payload.orders) {
      setOrders([]);
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить заявки."}`);
      return;
    }
    setOrders(payload.orders);
    setStatus(`Всего заявок: ${payload.orders.length}.`);
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  const sortedOrders = useMemo(
    () =>
      [...orders].sort((a, b) => {
        const p = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
        if (p !== 0) return p;
        return a.updatedMinutesAgo - b.updatedMinutesAgo;
      }),
    [orders],
  );

  function ensureDrafts(order: QueueOrder) {
    setApproveDrafts((prev) => {
      if (prev[order.id]) return prev;
      const next: ApproveDraftByLine = {};
      for (const line of order.lines) next[line.id] = { approvedQty: line.requestedQty, comment: "" };
      return { ...prev, [order.id]: next };
    });
    setIssueDrafts((prev) => {
      if (prev[order.id]) return prev;
      const next: IssueDraftByLine = {};
      for (const line of order.lines) next[line.id] = line.approvedQty ?? line.requestedQty;
      return { ...prev, [order.id]: next };
    });
    setCheckinDrafts((prev) => {
      if (prev[order.id]) return prev;
      const next: CheckinDraftByLine = {};
      for (const line of order.lines) {
        if (line.itemType !== "CONSUMABLE") {
          next[line.id] = {
            checked: true,
            returnedQty: line.issuedQty ?? line.approvedQty ?? line.requestedQty,
            condition: "OK",
            comment: "",
          };
        }
      }
      return { ...prev, [order.id]: next };
    });
    setEditDrafts((prev) => {
      if (prev[order.id]) return prev;
      return {
        ...prev,
        [order.id]: {
          lines: order.lines.map((line) => ({
            itemId: line.itemId,
            itemName: line.itemName,
            requestedQty: line.requestedQty,
          })),
          reason: "",
        },
      };
    });
    setNewLineByOrder((prev) => ({ ...prev, [order.id]: prev[order.id] ?? { itemId: "", qty: 1 } }));
  }

  async function openOrder(order: QueueOrder) {
    setExpandedOrderId((prev) => (prev === order.id ? null : order.id));
    ensureDrafts(order);
    if (!itemOptionsByOrder[order.id]) {
      const response = await fetch(`/api/items?startDate=${order.startDate}&endDate=${order.endDate}&limit=300`);
      if (response.ok) {
        const payload = (await response.json()) as { items?: ItemOption[] };
        setItemOptionsByOrder((prev) => ({ ...prev, [order.id]: payload.items ?? [] }));
      }
    }
  }

  async function approveOrder(order: QueueOrder) {
    setBusyOrderId(order.id);
    const draft = approveDrafts[order.id];
    const response = await fetch(`/api/orders/${order.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: order.lines.map((line) => ({
          orderLineId: line.id,
          approvedQty: draft?.[line.id]?.approvedQty ?? line.requestedQty,
          comment: draft?.[line.id]?.comment?.trim() || undefined,
        })),
        warehouseComment: warehouseComments[order.id]?.trim() || undefined,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка подтверждения: ${payload.error?.message ?? "проверьте данные"}`);
      setBusyOrderId(null);
      return;
    }
    setBusyOrderId(null);
    setStatus(`Заявка ${order.id} согласована.`);
    await loadQueue();
  }

  async function issueOrder(order: QueueOrder) {
    setBusyOrderId(order.id);
    const issueDraft = issueDrafts[order.id];
    const response = await fetch(`/api/orders/${order.id}/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: order.lines.map((line) => ({
          orderLineId: line.id,
          issuedQty: issueDraft?.[line.id] ?? (line.approvedQty ?? line.requestedQty),
        })),
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка выдачи: ${payload.error?.message ?? "операция не выполнена"}`);
      setBusyOrderId(null);
      return;
    }
    setBusyOrderId(null);
    setStatus(`Заявка ${order.id} выдана.`);
    await loadQueue();
  }

  async function saveWarehouseEdit(order: QueueOrder) {
    const draft = editDrafts[order.id];
    if (!draft || draft.lines.length === 0) {
      setStatus("Состав заявки пустой. Добавьте хотя бы одну позицию.");
      return;
    }
    setBusyOrderId(order.id);
    const response = await fetch(`/api/orders/${order.id}/warehouse-edit`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: draft.lines.map((line) => ({
          itemId: line.itemId,
          requestedQty: line.requestedQty,
        })),
        reason: draft.reason.trim() || undefined,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка правки: ${payload.error?.message ?? "не удалось обновить"}`);
      setBusyOrderId(null);
      return;
    }
    setBusyOrderId(null);
    setStatus(`Состав заявки ${order.id} обновлен.`);
    await loadQueue();
  }

  async function checkinFastAllOk(order: QueueOrder) {
    const lines = order.lines
      .filter((line) => line.itemType !== "CONSUMABLE")
      .map((line) => ({
        orderLineId: line.id,
        returnedQty: line.issuedQty ?? line.approvedQty ?? line.requestedQty,
        condition: "OK" as const,
      }));
    if (lines.length === 0) {
      setStatus("В заявке нет позиций для приемки.");
      return;
    }
    setBusyOrderId(order.id);
    const response = await fetch(`/api/orders/${order.id}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка приемки: ${payload.error?.message ?? "операция не выполнена"}`);
      setBusyOrderId(null);
      return;
    }
    setBusyOrderId(null);
    setExpandedCheckinOrderId(null);
    setStatus(`Заявка ${order.id} закрыта.`);
    await loadQueue();
  }

  async function checkinDetailed(order: QueueOrder) {
    const draft = checkinDrafts[order.id] ?? {};
    const lines = Object.entries(draft)
      .filter(([, value]) => value.checked)
      .map(([orderLineId, value]) => ({
        orderLineId,
        returnedQty: value.returnedQty,
        condition: value.condition,
        comment: value.comment.trim() || undefined,
      }));
    if (lines.length === 0) {
      setStatus("Отметьте минимум одну позицию для приемки.");
      return;
    }
    setBusyOrderId(order.id);
    const response = await fetch(`/api/orders/${order.id}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка приемки: ${payload.error?.message ?? "операция не выполнена"}`);
      setBusyOrderId(null);
      return;
    }
    setBusyOrderId(null);
    setExpandedCheckinOrderId(null);
    setStatus(`Заявка ${order.id} закрыта.`);
    await loadQueue();
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Очередь заявок</h1>
        <button className="ws-btn-primary disabled:opacity-50" onClick={() => void loadQueue()} disabled={busyOrderId !== null}>
          Обновить заявки
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">{status}</p>

      <div className="space-y-3">
        {sortedOrders.map((order) => (
          <article key={order.id} className={`ws-card border p-4 ${cardClass(order.status)}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="text-sm font-semibold">
                  {order.customerName ?? "Без заказчика"} {order.eventName ? `• ${order.eventName}` : ""}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Коллега: {order.createdBy.username ?? `ID ${order.createdBy.telegramId}`}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Даты: {order.startDate} - {order.endDate} • обновлено {order.updatedMinutesAgo} мин назад
                </div>
                <div className="text-xs text-[var(--muted)]">Состав: {previewLines(order.lines)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium">{statusText(order.status)}</span>
                <button className="ws-btn" type="button" onClick={() => void openOrder(order)}>
                  {expandedOrderId === order.id ? "Скрыть детали" : "Открыть детали"}
                </button>
                {order.status === "SUBMITTED" ? (
                  <button
                    className="ws-btn-primary disabled:opacity-50"
                    type="button"
                    onClick={() => void approveOrder(order)}
                    disabled={busyOrderId !== null}
                  >
                    {busyOrderId === order.id ? "..." : "Согласовать"}
                  </button>
                ) : null}
                {order.status === "APPROVED" ? (
                  <button
                    className="ws-btn-primary disabled:opacity-50"
                    type="button"
                    onClick={() => void issueOrder(order)}
                    disabled={busyOrderId !== null}
                  >
                    {busyOrderId === order.id ? "..." : "Выдать"}
                  </button>
                ) : null}
                {(order.status === "ISSUED" || order.status === "RETURN_DECLARED") ? (
                  <>
                    <button
                      className="ws-btn disabled:opacity-50"
                      type="button"
                      onClick={() => void checkinFastAllOk(order)}
                      disabled={busyOrderId !== null}
                    >
                      Принять все (ОК)
                    </button>
                    <button
                      className="ws-btn disabled:opacity-50"
                      type="button"
                      onClick={() => setExpandedCheckinOrderId((prev) => (prev === order.id ? null : order.id))}
                      disabled={busyOrderId !== null}
                    >
                      {expandedCheckinOrderId === order.id ? "Скрыть приемку" : "Приемка по позициям"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {expandedOrderId === order.id ? (
              <div className="mt-4 space-y-3 rounded-2xl border border-white/60 bg-white/70 p-3">
                {(order.status === "SUBMITTED" || order.status === "APPROVED") && editDrafts[order.id] ? (
                  <div className="ws-card p-3">
                    <div className="mb-2 text-sm font-semibold">Корректировка корзины клиентской заявки</div>
                    <div className="space-y-2">
                      {editDrafts[order.id].lines.map((line, idx) => (
                        <div key={`${line.itemId}-${idx}`} className="grid grid-cols-[1fr_110px_auto] items-center gap-2">
                          <div className="text-sm">{line.itemName}</div>
                          <input
                            className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
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
                            className="ws-btn"
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
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_80px_auto]">
                      <select
                        className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                        value={newLineByOrder[order.id]?.itemId ?? ""}
                        onChange={(event) =>
                          setNewLineByOrder((prev) => ({
                            ...prev,
                            [order.id]: { itemId: event.target.value, qty: prev[order.id]?.qty ?? 1 },
                          }))
                        }
                      >
                        <option value="">Добавить позицию...</option>
                        {(itemOptionsByOrder[order.id] ?? []).map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name} (доступно: {option.availableQty})
                          </option>
                        ))}
                      </select>
                      <input
                        className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                        type="number"
                        min={1}
                        value={newLineByOrder[order.id]?.qty ?? 1}
                        onChange={(event) =>
                          setNewLineByOrder((prev) => ({
                            ...prev,
                            [order.id]: { itemId: prev[order.id]?.itemId ?? "", qty: Math.max(1, Number(event.target.value)) },
                          }))
                        }
                      />
                      <button
                        className="ws-btn"
                        type="button"
                        onClick={() => {
                          const draft = newLineByOrder[order.id];
                          const option = (itemOptionsByOrder[order.id] ?? []).find((entry) => entry.id === draft?.itemId);
                          if (!option || !draft) return;
                          setEditDrafts((prev) => ({
                            ...prev,
                            [order.id]: {
                              ...prev[order.id],
                              lines: [...prev[order.id].lines, { itemId: option.id, itemName: option.name, requestedQty: draft.qty }],
                            },
                          }));
                        }}
                      >
                        Добавить
                      </button>
                    </div>
                    <input
                      className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                      value={editDrafts[order.id].reason}
                      onChange={(event) =>
                        setEditDrafts((prev) => ({
                          ...prev,
                          [order.id]: { ...prev[order.id], reason: event.target.value },
                        }))
                      }
                      placeholder="Причина правки (если есть)"
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        className="ws-btn-primary disabled:opacity-50"
                        type="button"
                        onClick={() => void saveWarehouseEdit(order)}
                        disabled={busyOrderId !== null}
                      >
                        Сохранить изменения
                      </button>
                    </div>
                  </div>
                ) : null}

                {order.status === "SUBMITTED" ? (
                  <div className="ws-card p-3">
                    <div className="mb-2 text-sm font-semibold">Согласование по позициям</div>
                    <div className="space-y-2">
                      {order.lines.map((line) => (
                        <div key={line.id} className="rounded-xl border border-[var(--border)] p-2">
                          <div className="text-sm font-medium">{line.itemName}</div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <input
                              className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                              type="number"
                              min={0}
                              max={line.requestedQty}
                              value={approveDrafts[order.id]?.[line.id]?.approvedQty ?? line.requestedQty}
                              onChange={(event) =>
                                setApproveDrafts((prev) => ({
                                  ...prev,
                                  [order.id]: {
                                    ...(prev[order.id] ?? {}),
                                    [line.id]: {
                                      approvedQty: Math.max(0, Math.min(line.requestedQty, Number(event.target.value))),
                                      comment: prev[order.id]?.[line.id]?.comment ?? "",
                                    },
                                  },
                                }))
                              }
                            />
                            <input
                              className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                              value={approveDrafts[order.id]?.[line.id]?.comment ?? ""}
                              onChange={(event) =>
                                setApproveDrafts((prev) => ({
                                  ...prev,
                                  [order.id]: {
                                    ...(prev[order.id] ?? {}),
                                    [line.id]: {
                                      approvedQty: prev[order.id]?.[line.id]?.approvedQty ?? line.requestedQty,
                                      comment: event.target.value,
                                    },
                                  },
                                }))
                              }
                              placeholder="Комментарий по позиции"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <input
                      className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                      value={warehouseComments[order.id] ?? ""}
                      onChange={(event) => setWarehouseComments((prev) => ({ ...prev, [order.id]: event.target.value }))}
                      placeholder="Общий комментарий склада"
                    />
                  </div>
                ) : null}

                {order.status === "APPROVED" ? (
                  <div className="ws-card p-3">
                    <div className="mb-2 text-sm font-semibold">Выдача по позициям</div>
                    <div className="space-y-2">
                      {order.lines.map((line) => (
                        <div key={line.id} className="grid grid-cols-[1fr_110px] items-center gap-2 rounded-xl border border-[var(--border)] p-2">
                          <div className="text-sm">{line.itemName}</div>
                          <input
                            className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                            type="number"
                            min={0}
                            max={line.approvedQty ?? line.requestedQty}
                            value={issueDrafts[order.id]?.[line.id] ?? (line.approvedQty ?? line.requestedQty)}
                            onChange={(event) =>
                              setIssueDrafts((prev) => ({
                                ...prev,
                                [order.id]: {
                                  ...(prev[order.id] ?? {}),
                                  [line.id]: Math.max(
                                    0,
                                    Math.min(line.approvedQty ?? line.requestedQty, Number(event.target.value)),
                                  ),
                                },
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {expandedCheckinOrderId === order.id ? (
              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white/80 p-3">
                <div className="mb-2 text-sm font-semibold">Приемка по позициям</div>
                <div className="space-y-2">
                  {order.lines
                    .filter((line) => line.itemType !== "CONSUMABLE")
                    .map((line) => {
                      const draft = checkinDrafts[order.id]?.[line.id];
                      return (
                        <div key={line.id} className="rounded-xl border border-[var(--border)] p-2">
                          <label className="mb-1 inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={draft?.checked ?? true}
                              onChange={(event) =>
                                setCheckinDrafts((prev) => ({
                                  ...prev,
                                  [order.id]: {
                                    ...(prev[order.id] ?? {}),
                                    [line.id]: { ...(prev[order.id]?.[line.id] ?? draft), checked: event.target.checked } as CheckinDraftByLine[string],
                                  },
                                }))
                              }
                            />
                            <span>{line.itemName}</span>
                          </label>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <input
                              className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                              type="number"
                              min={0}
                              max={line.issuedQty ?? line.approvedQty ?? line.requestedQty}
                              value={draft?.returnedQty ?? (line.issuedQty ?? line.approvedQty ?? line.requestedQty)}
                              onChange={(event) =>
                                setCheckinDrafts((prev) => ({
                                  ...prev,
                                  [order.id]: {
                                    ...(prev[order.id] ?? {}),
                                    [line.id]: {
                                      ...(prev[order.id]?.[line.id] ?? draft),
                                      returnedQty: Number(event.target.value),
                                    } as CheckinDraftByLine[string],
                                  },
                                }))
                              }
                            />
                            <select
                              className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                              value={draft?.condition ?? "OK"}
                              onChange={(event) =>
                                setCheckinDrafts((prev) => ({
                                  ...prev,
                                  [order.id]: {
                                    ...(prev[order.id] ?? {}),
                                    [line.id]: {
                                      ...(prev[order.id]?.[line.id] ?? draft),
                                      condition: event.target.value as CheckinCondition,
                                    } as CheckinDraftByLine[string],
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
                                setCheckinDrafts((prev) => ({
                                  ...prev,
                                  [order.id]: {
                                    ...(prev[order.id] ?? {}),
                                    [line.id]: {
                                      ...(prev[order.id]?.[line.id] ?? draft),
                                      comment: event.target.value,
                                    } as CheckinDraftByLine[string],
                                  },
                                }))
                              }
                              placeholder="Комментарий"
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    className="ws-btn-primary disabled:opacity-50"
                    type="button"
                    onClick={() => void checkinDetailed(order)}
                    disabled={busyOrderId !== null}
                  >
                    Подтвердить приемку
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
