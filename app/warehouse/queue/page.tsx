"use client";

import { useEffect, useMemo, useState } from "react";
import { checkinConditionLabel } from "@/lib/checkin-labels";

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
  readyByDate: string;
  notes: string | null;
  deliveryRequested?: boolean;
  deliveryComment?: string | null;
  mountRequested?: boolean;
  mountComment?: string | null;
  dismountRequested?: boolean;
  dismountComment?: string | null;
  deliveryPrice?: number | null;
  mountPrice?: number | null;
  dismountPrice?: number | null;
  warehouseInternalNote?: string | null;
  clientDeclaration: {
    lines: Array<{
      orderLineId: string;
      itemId: string;
      returnedQty: number;
      issuedQty: number;
      condition: "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";
      comment: string | null;
    }>;
    comment: string | null;
  } | null;
  createdBy: { username: string | null; telegramId: string };
  lines: QueueLine[];
};

type IssueDraftByLine = Record<string, number>;
type CheckinDraftByLine = Record<string, { checked: boolean; returnedQty: number; condition: CheckinCondition; comment: string }>;
type EditDraft = {
  lines: Array<{
    lineId: string | null;
    itemId: string;
    itemName: string;
    requestedQty: number;
    approvedQty: number;
    comment: string;
  }>;
  reason: string;
};
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

function statusBadge(status: QueueOrder["status"]): string {
  if (status === "SUBMITTED") return "bg-violet-100 text-violet-800 border-violet-200";
  if (status === "APPROVED") return "bg-indigo-100 text-indigo-800 border-indigo-200";
  if (status === "RETURN_DECLARED") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "ISSUED") return "bg-sky-100 text-sky-800 border-sky-200";
  return "bg-zinc-100 text-zinc-700 border-zinc-200";
}

function statusDotClass(status: QueueOrder["status"]): string {
  if (status === "SUBMITTED") return "bg-violet-500";
  if (status === "APPROVED") return "bg-indigo-500";
  if (status === "RETURN_DECLARED") return "bg-amber-500";
  if (status === "ISSUED") return "bg-sky-500";
  return "bg-zinc-500";
}

function cardClass(status: QueueOrder["status"]): string {
  if (status === "SUBMITTED") return "bg-violet-50 border-violet-200";
  if (status === "APPROVED") return "bg-indigo-50 border-indigo-200";
  if (status === "RETURN_DECLARED") return "bg-amber-50 border-amber-200";
  if (status === "ISSUED") return "bg-zinc-50 border-zinc-200";
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

  const [issueDrafts, setIssueDrafts] = useState<Record<string, IssueDraftByLine>>({});
  const [warehouseComments, setWarehouseComments] = useState<Record<string, string>>({});
  const [checkinDrafts, setCheckinDrafts] = useState<Record<string, CheckinDraftByLine>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, EditDraft>>({});
  const [itemOptionsByOrder, setItemOptionsByOrder] = useState<Record<string, ItemOption[]>>({});
  const [newLineByOrder, setNewLineByOrder] = useState<Record<string, { itemId: string; qty: number }>>({});
  const [servicePricesByOrder, setServicePricesByOrder] = useState<
    Record<string, { deliveryPrice: number | null; mountPrice: number | null; dismountPrice: number | null }>
  >({});
  const [internalNoteDrafts, setInternalNoteDrafts] = useState<Record<string, string>>({});
  const [savingInternalNoteOrderId, setSavingInternalNoteOrderId] = useState<string | null>(null);

  async function saveInternalNote(order: QueueOrder) {
    const value = (internalNoteDrafts[order.id] ?? order.warehouseInternalNote ?? "").trim();
    setSavingInternalNoteOrderId(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/internal-note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ note: value || null }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: { message?: string } };
        setStatus(`Ошибка заметки: ${err.error?.message ?? res.statusText}`);
        return;
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, warehouseInternalNote: value || null } : o)),
      );
      setInternalNoteDrafts((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
    } finally {
      setSavingInternalNoteOrderId(null);
    }
  }

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
        const dateCmp = a.readyByDate.localeCompare(b.readyByDate);
        if (dateCmp !== 0) return dateCmp;
        if (a.isEmergency !== b.isEmergency) return a.isEmergency ? -1 : 1;
        const p = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
        if (p !== 0) return p;
        return a.updatedMinutesAgo - b.updatedMinutesAgo;
      }),
    [orders],
  );

  function ensureDrafts(order: QueueOrder) {
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
          const clientLine = order.clientDeclaration?.lines.find((entry) => entry.orderLineId === line.id);
          next[line.id] = {
            checked: true,
            returnedQty: clientLine?.returnedQty ?? (line.issuedQty ?? line.approvedQty ?? line.requestedQty),
            condition: clientLine?.condition ?? "OK",
            comment: clientLine?.comment ?? "",
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
            lineId: line.id,
            itemId: line.itemId,
            itemName: line.itemName,
            requestedQty: line.requestedQty,
            approvedQty: line.requestedQty,
            comment: "",
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
    try {
      const draft = editDrafts[order.id];
      const linesPayload = order.lines.map((line) => {
        const edited =
          draft?.lines.find((entry) => entry.lineId === line.id) ??
          draft?.lines.find((entry) => entry.itemId === line.itemId);
        const approvedQty =
          edited != null
            ? Math.max(0, Math.min(line.requestedQty, Number(edited.approvedQty) || 0))
            : (line.approvedQty ?? line.requestedQty);
        const comment = edited?.comment?.trim() || undefined;
        return {
          orderLineId: line.id,
          approvedQty: Number(approvedQty),
          comment,
        };
      });
      const prices = servicePricesByOrder[order.id];
      const deliveryPrice = order.deliveryRequested
        ? (prices?.deliveryPrice ?? order.deliveryPrice ?? null)
        : null;
      const mountPrice = order.mountRequested
        ? (prices?.mountPrice ?? order.mountPrice ?? null)
        : null;
      const dismountPrice = order.dismountRequested
        ? (prices?.dismountPrice ?? order.dismountPrice ?? null)
        : null;
      const response = await fetch(`/api/orders/${order.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: linesPayload,
          warehouseComment: warehouseComments[order.id]?.trim() || undefined,
          deliveryPrice: deliveryPrice ?? undefined,
          mountPrice: mountPrice ?? undefined,
          dismountPrice: dismountPrice ?? undefined,
        }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setStatus(`Ошибка подтверждения: ${payload.error?.message ?? "проверьте данные"}`);
        return;
      }
      setStatus(`Заявка ${order.id} согласована.`);
      await loadQueue();
    } catch {
      setStatus("Ошибка сети при подтверждении.");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function issueOrder(order: QueueOrder) {
    setBusyOrderId(order.id);
    try {
      const response = await fetch(`/api/orders/${order.id}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: order.lines.map((line) => ({
            orderLineId: line.id,
            issuedQty: line.approvedQty ?? line.requestedQty,
          })),
        }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setStatus(`Ошибка выдачи: ${payload.error?.message ?? "операция не выполнена"}`);
        return;
      }
      setStatus(`Заявка ${order.id} выдана.`);
      await loadQueue();
    } catch {
      setStatus("Ошибка сети при выдаче.");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function cancelOrder(order: QueueOrder) {
    if (order.status !== "SUBMITTED" && order.status !== "APPROVED") return;
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
      await loadQueue();
    } catch {
      setStatus("Ошибка сети при отмене.");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function saveWarehouseEdit(order: QueueOrder) {
    const draft = editDrafts[order.id];
    if (!draft || draft.lines.length === 0) {
      setStatus("Состав заявки пустой. Добавьте хотя бы одну позицию.");
      return;
    }
    setBusyOrderId(order.id);
    try {
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
      const payload = (await response.json()) as {
        error?: { message?: string };
        order?: { id: string; lines: Array<{ id: string; itemId: string; requestedQty: number }> };
      };
      if (!response.ok) {
        setStatus(`Ошибка правки: ${payload.error?.message ?? "не удалось обновить"}`);
        return;
      }
      if (payload.order?.lines) {
        setEditDrafts((prev) => {
          const prevDraft = prev[order.id];
          if (!prevDraft) return prev;
          const lines = payload.order!.lines.map((line) => {
            const oldLine = prevDraft.lines.find((e) => e.itemId === line.itemId);
            return {
              lineId: line.id,
              itemId: line.itemId,
              itemName: oldLine?.itemName ?? line.itemId,
              requestedQty: line.requestedQty,
              approvedQty: oldLine != null ? Math.min(line.requestedQty, oldLine.approvedQty) : line.requestedQty,
              comment: oldLine?.comment ?? "",
            };
          });
          return {
            ...prev,
            [order.id]: { ...prevDraft, lines },
          };
        });
      }
      setStatus(`Состав заявки ${order.id} обновлен.`);
      await loadQueue();
    } catch {
      setStatus("Ошибка сети при сохранении правок.");
    } finally {
      setBusyOrderId(null);
    }
  }

  const canCheckinWithoutReturnDeclared = (o: QueueOrder) =>
    o.status === "ISSUED" && o.orderSource === "WOWSTORG_EXTERNAL";

  async function checkinFastAllOk(order: QueueOrder) {
    if (order.status !== "RETURN_DECLARED" && !canCheckinWithoutReturnDeclared(order)) {
      setStatus("Приемка доступна только после того, как клиент отправит возврат на приемку.");
      return;
    }
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
    try {
      const response = await fetch(`/api/orders/${order.id}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setStatus(`Ошибка приемки: ${payload.error?.message ?? "операция не выполнена"}`);
        return;
      }
      setExpandedCheckinOrderId(null);
      setStatus(`Заявка ${order.id} закрыта.`);
      await loadQueue();
    } catch {
      setStatus("Ошибка сети при приемке.");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function checkinDetailed(order: QueueOrder) {
    if (order.status !== "RETURN_DECLARED" && !canCheckinWithoutReturnDeclared(order)) {
      setStatus("Приемка доступна только после того, как клиент отправит возврат на приемку.");
      return;
    }
    const draft = checkinDrafts[order.id] ?? {};
    const issuedByLine = (l: QueueLine) => l.issuedQty ?? l.approvedQty ?? l.requestedQty;
    const lines = order.lines
      .filter((line) => line.itemType !== "CONSUMABLE")
      .map((line) => {
        const value = draft[line.id];
        const issued = issuedByLine(line);
        let returnedQty = Number.isInteger(value?.returnedQty) ? value.returnedQty : issued;
        returnedQty = Math.max(0, Math.min(issued, returnedQty));
        return {
          orderLineId: line.id,
          returnedQty,
          condition: value?.condition ?? "OK",
          comment: value?.comment?.trim() || undefined,
        };
      });
    if (lines.length === 0) {
      setStatus("Отметьте минимум одну позицию для приемки.");
      return;
    }
    setBusyOrderId(order.id);
    try {
      const response = await fetch(`/api/orders/${order.id}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const raw = await response.text();
      let payload: { error?: { message?: string } };
      try {
        payload = JSON.parse(raw) as { error?: { message?: string } };
      } catch {
        payload = {};
      }
      if (!response.ok) {
        const msg = payload.error?.message ?? (raw?.slice(0, 200) || "операция не выполнена");
        setStatus(`Ошибка приемки (${response.status}): ${msg}`);
        return;
      }
      setExpandedCheckinOrderId(null);
      setStatus(`Заявка ${order.id} закрыта.`);
      await loadQueue();
    } catch {
      setStatus("Ошибка сети при приемке.");
    } finally {
      setBusyOrderId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Очередь заявок</h1>
        <div className="flex items-center gap-2">
          <button className="ws-btn" onClick={() => { globalThis.location.href = "/"; }}>
            Назад
          </button>
          <button className="ws-btn-primary disabled:opacity-50" onClick={() => void loadQueue()} disabled={busyOrderId !== null}>
            Обновить заявки
          </button>
        </div>
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
                <div className="mt-1 rounded-lg border-2 border-amber-400 bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-900">
                  Готовность к: {order.readyByDate.split("-").reverse().join(".")}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Коллега: {order.createdBy.username ?? `ID ${order.createdBy.telegramId}`}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Период аренды: {order.startDate} — {order.endDate} • обновлено {order.updatedMinutesAgo} мин назад
                </div>
                <div className="text-xs text-[var(--muted)]">Состав: {previewLines(order.lines)}</div>
                {order.warehouseInternalNote?.trim() ? (
                  <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                    <span className="font-medium">Заметка склада:</span>{" "}
                    {order.warehouseInternalNote.trim().length > 80
                      ? `${order.warehouseInternalNote.trim().slice(0, 80)}…`
                      : order.warehouseInternalNote.trim()}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${statusBadge(order.status)}`}>
                  <i className={`h-2 w-2 rounded-full ${statusDotClass(order.status)}`} />
                  {statusText(order.status)}
                </span>
                <button className="ws-btn" type="button" onClick={() => void openOrder(order)}>
                  {expandedOrderId === order.id ? "Скрыть детали" : "Открыть детали"}
                </button>
                {order.status === "SUBMITTED" ? (
                  (() => {
                    const prices = servicePricesByOrder[order.id];
                    const needDelivery =
                      order.deliveryRequested &&
                      (prices?.deliveryPrice ?? order.deliveryPrice) == null;
                    const needMount =
                      order.mountRequested && (prices?.mountPrice ?? order.mountPrice) == null;
                    const needDismount =
                      order.dismountRequested &&
                      (prices?.dismountPrice ?? order.dismountPrice) == null;
                    const servicePricesMissing = needDelivery || needMount || needDismount;
                    return (
                      <button
                        className="ws-btn-primary disabled:opacity-50"
                        type="button"
                        onClick={() => void approveOrder(order)}
                        disabled={busyOrderId !== null || servicePricesMissing}
                        title={servicePricesMissing ? "Укажите цены на включённые услуги" : undefined}
                      >
                        {busyOrderId === order.id ? "..." : "Согласовать"}
                      </button>
                    );
                  })()
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
                {(order.status === "SUBMITTED" || order.status === "APPROVED") ? (
                  <button
                    className="ws-btn disabled:opacity-50"
                    type="button"
                    onClick={() => void cancelOrder(order)}
                    disabled={busyOrderId !== null}
                    title="Отменить заявку (попадёт в архив)"
                  >
                    Отменить заявку
                  </button>
                ) : null}
                {(order.status === "ISSUED" || order.status === "RETURN_DECLARED") ? (
                  <>
                    <button
                      className="ws-btn disabled:opacity-50"
                      type="button"
                      onClick={() => void checkinFastAllOk(order)}
                      disabled={busyOrderId !== null || (order.status !== "RETURN_DECLARED" && !canCheckinWithoutReturnDeclared(order))}
                    >
                      Принять все (ОК)
                    </button>
                    <button
                      className="ws-btn disabled:opacity-50"
                      type="button"
                      onClick={() => {
                        ensureDrafts(order);
                        setExpandedCheckinOrderId((prev) => (prev === order.id ? null : order.id));
                      }}
                      disabled={busyOrderId !== null || (order.status !== "RETURN_DECLARED" && !canCheckinWithoutReturnDeclared(order))}
                    >
                      {expandedCheckinOrderId === order.id ? "Скрыть приемку" : "Приемка по позициям"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {expandedOrderId === order.id ? (
              <div className="mt-4 space-y-3 rounded-2xl border border-[var(--border)] bg-white p-3">
                {(order.status === "ISSUED" || order.status === "RETURN_DECLARED") ? (
                  <div className="ws-card p-3">
                    <div className="mb-2 text-sm font-semibold">Полный состав заявки</div>
                    <div className="space-y-1 text-sm">
                      {order.lines.map((line) => (
                        <div key={line.id} className="rounded-lg border border-[var(--border)] px-2 py-1">
                          {line.itemName}: запрос {line.requestedQty}, согласовано {line.approvedQty ?? 0}, выдано{" "}
                          {line.issuedQty ?? 0}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {(order.deliveryRequested || order.mountRequested || order.dismountRequested) ? (
                  <div className="ws-card p-3">
                    <div className="mb-2 text-sm font-semibold">Услуги</div>
                    <ul className="space-y-1 text-sm">
                      {order.deliveryRequested ? (
                        <li className="rounded-lg border border-[var(--border)] px-2 py-1">
                          Доставка: {order.deliveryComment?.trim() || "—"}
                        </li>
                      ) : null}
                      {order.mountRequested ? (
                        <li className="rounded-lg border border-[var(--border)] px-2 py-1">
                          Монтаж: {order.mountComment?.trim() || "—"}
                        </li>
                      ) : null}
                      {order.dismountRequested ? (
                        <li className="rounded-lg border border-[var(--border)] px-2 py-1">
                          Демонтаж: {order.dismountComment?.trim() || "—"}
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
                <div className="ws-card p-3">
                  <div className="mb-2 text-sm font-semibold text-[var(--muted)]">Заметка склада (только для сотрудников)</div>
                  <p className="mb-2 text-xs text-[var(--muted)]">Видна только складским и админам. Удаляется при закрытии или отмене заявки.</p>
                  <textarea
                    className="mb-2 w-full min-h-[72px] rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                    placeholder="Напоминание, куда звонить, дата доставки…"
                    value={internalNoteDrafts[order.id] ?? order.warehouseInternalNote ?? ""}
                    onChange={(e) =>
                      setInternalNoteDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="ws-btn"
                    disabled={savingInternalNoteOrderId === order.id}
                    onClick={() => void saveInternalNote(order)}
                  >
                    {savingInternalNoteOrderId === order.id ? "…" : "Сохранить заметку"}
                  </button>
                </div>
                {order.status === "SUBMITTED" &&
                (order.deliveryRequested || order.mountRequested || order.dismountRequested) ? (
                  <div className="ws-card p-3">
                    <div className="mb-2 text-sm font-semibold">Цены на услуги (обязательно перед согласованием)</div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {order.deliveryRequested ? (
                        <div>
                          <label className="text-xs text-[var(--muted)]">Доставка, ₽</label>
                          <input
                            className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                            type="number"
                            min={0}
                            step={0.01}
                            value={servicePricesByOrder[order.id]?.deliveryPrice ?? order.deliveryPrice ?? ""}
                            onChange={(e) =>
                              setServicePricesByOrder((prev) => ({
                                ...prev,
                                [order.id]: {
                                  deliveryPrice: e.target.value === "" ? null : Number(e.target.value),
                                  mountPrice: prev[order.id]?.mountPrice ?? null,
                                  dismountPrice: prev[order.id]?.dismountPrice ?? null,
                                },
                              }))
                            }
                            placeholder="0"
                          />
                        </div>
                      ) : null}
                      {order.mountRequested ? (
                        <div>
                          <label className="text-xs text-[var(--muted)]">Монтаж, ₽</label>
                          <input
                            className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                            type="number"
                            min={0}
                            step={0.01}
                            value={servicePricesByOrder[order.id]?.mountPrice ?? order.mountPrice ?? ""}
                            onChange={(e) =>
                              setServicePricesByOrder((prev) => ({
                                ...prev,
                                [order.id]: {
                                  deliveryPrice: prev[order.id]?.deliveryPrice ?? null,
                                  mountPrice: e.target.value === "" ? null : Number(e.target.value),
                                  dismountPrice: prev[order.id]?.dismountPrice ?? null,
                                },
                              }))
                            }
                            placeholder="0"
                          />
                        </div>
                      ) : null}
                      {order.dismountRequested ? (
                        <div>
                          <label className="text-xs text-[var(--muted)]">Демонтаж, ₽</label>
                          <input
                            className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                            type="number"
                            min={0}
                            step={0.01}
                            value={servicePricesByOrder[order.id]?.dismountPrice ?? order.dismountPrice ?? ""}
                            onChange={(e) =>
                              setServicePricesByOrder((prev) => ({
                                ...prev,
                                [order.id]: {
                                  deliveryPrice: prev[order.id]?.deliveryPrice ?? null,
                                  mountPrice: prev[order.id]?.mountPrice ?? null,
                                  dismountPrice: e.target.value === "" ? null : Number(e.target.value),
                                },
                              }))
                            }
                            placeholder="0"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {(order.status === "SUBMITTED" || order.status === "APPROVED") && editDrafts[order.id] ? (
                  <div className="ws-card p-3">
                    <div className="mb-2 text-sm font-semibold">Корректировка корзины клиентской заявки</div>
                    <div className="mb-2 text-xs text-[var(--muted)]">
                      В одной таблице: запрос клиента, согласованное количество и комментарий клиенту.
                    </div>
                    <div className="mb-2 grid grid-cols-1 gap-2 text-xs text-[var(--muted)] sm:grid-cols-[1fr_90px_90px_1fr_auto]">
                      <div>Позиция</div>
                      <div>Запрос</div>
                      <div>Соглас.</div>
                      <div>Комментарий</div>
                      <div />
                    </div>
                    <div className="space-y-2">
                      {editDrafts[order.id].lines.map((line, idx) => (
                        <div key={`${line.itemId}-${idx}`} className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--border)] p-2 sm:grid-cols-[1fr_90px_90px_1fr_auto]">
                          <div className="text-sm">{line.itemName}</div>
                          <div className="flex items-center rounded-xl border border-transparent bg-[var(--muted)]/30 px-2 py-1 text-sm text-[var(--muted)]">
                            {line.requestedQty}
                          </div>
                          <input
                            className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                            type="number"
                            min={0}
                            max={line.requestedQty}
                            value={line.approvedQty}
                            onChange={(event) =>
                              setEditDrafts((prev) => ({
                                ...prev,
                                [order.id]: {
                                  ...prev[order.id],
                                  lines: prev[order.id].lines.map((entry, entryIdx) =>
                                    entryIdx === idx
                                      ? {
                                          ...entry,
                                          approvedQty: Math.max(0, Math.min(line.requestedQty, Number(event.target.value) || 0)),
                                        }
                                      : entry,
                                  ),
                                },
                              }))
                            }
                            aria-label="Согласованное количество"
                          />
                          <input
                            className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                            value={line.comment}
                            onChange={(event) =>
                              setEditDrafts((prev) => ({
                                ...prev,
                                [order.id]: {
                                  ...prev[order.id],
                                  lines: prev[order.id].lines.map((entry, entryIdx) =>
                                    entryIdx === idx
                                      ? {
                                          ...entry,
                                          comment: event.target.value,
                                        }
                                      : entry,
                                  ),
                                },
                              }))
                            }
                            placeholder="Комментарий клиенту"
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
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_90px_auto] sm:items-stretch">
                      <select
                        className="w-full min-w-0 rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
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
                        className="w-full min-w-0 rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm sm:w-[90px]"
                        type="number"
                        min={1}
                        value={newLineByOrder[order.id]?.qty ?? 1}
                        onChange={(event) =>
                          setNewLineByOrder((prev) => ({
                            ...prev,
                            [order.id]: { itemId: prev[order.id]?.itemId ?? "", qty: Math.max(1, Number(event.target.value)) },
                          }))
                        }
                        aria-label="Количество"
                      />
                      <button
                        className="ws-btn w-full sm:w-auto sm:min-w-[90px]"
                        type="button"
                        onClick={() => {
                          const draft = newLineByOrder[order.id];
                          const option = (itemOptionsByOrder[order.id] ?? []).find((entry) => entry.id === draft?.itemId);
                          if (!option || !draft) return;
                          setEditDrafts((prev) => ({
                            ...prev,
                            [order.id]: {
                              ...prev[order.id],
                              lines: [
                                ...prev[order.id].lines,
                                {
                                  lineId: null,
                                  itemId: option.id,
                                  itemName: option.name,
                                  requestedQty: draft.qty,
                                  approvedQty: draft.qty,
                                  comment: "",
                                },
                              ],
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

                {order.status === "APPROVED" ? (
                  <p className="text-xs text-[var(--muted)]">
                    Выдача будет по согласованным количествам. Нажмите «Выдать» выше.
                  </p>
                ) : null}
              </div>
            ) : null}

            {expandedCheckinOrderId === order.id ? (
              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-3">
                <div className="mb-2 text-sm font-semibold">Приемка по позициям</div>
                {order.status !== "RETURN_DECLARED" && !canCheckinWithoutReturnDeclared(order) ? (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    Клиент еще не отправил возврат на приемку. Дождитесь статуса «Ожидает приемки».
                  </div>
                ) : null}
                {order.clientDeclaration ? (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    <div className="font-semibold">Что отметил клиент при возврате (со слов клиента):</div>
                    <ul className="mt-1 space-y-1">
                      {order.clientDeclaration.lines.map((line) => (
                        <li key={line.orderLineId}>
                          {order.lines.find((entry) => entry.id === line.orderLineId)?.itemName ?? line.itemId}: {line.returnedQty} из {line.issuedQty}, {checkinConditionLabel(line.condition)}
                          {line.comment ? ` (${line.comment})` : ""}
                        </li>
                      ))}
                    </ul>
                    {order.clientDeclaration.comment ? (
                      <div className="mt-1">Комментарий клиента: {order.clientDeclaration.comment}</div>
                    ) : null}
                  </div>
                ) : null}
                <div className="space-y-2">
                  {order.lines
                    .filter((line) => line.itemType !== "CONSUMABLE")
                    .map((line) => {
                      const draft = checkinDrafts[order.id]?.[line.id];
                      const clientLine = order.clientDeclaration?.lines.find((entry) => entry.orderLineId === line.id);
                      const issued = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
                      const returnedQty = draft?.returnedQty ?? issued;
                      const lostQty = Math.max(0, issued - returnedQty);
                      const condition = draft?.condition ?? "OK";
                      const isMissing = condition === "MISSING";
                      return (
                        <div key={line.id} className="rounded-xl border border-[var(--border)] p-2">
                          <div className="mb-1 text-sm font-medium">{line.itemName}</div>
                          {clientLine ? (
                            <div className="mb-1 text-xs text-amber-800">
                              Со слов клиента: {clientLine.returnedQty} из {clientLine.issuedQty}, {checkinConditionLabel(clientLine.condition)}
                              {clientLine.comment ? ` (${clientLine.comment})` : ""}
                            </div>
                          ) : null}
                          <div className="grid gap-2 sm:grid-cols-3">
                            <label className="flex flex-col gap-0.5 text-xs text-[var(--muted)]">
                              Принято, шт
                              <input
                                className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                                type="number"
                                min={0}
                                max={issued}
                                value={returnedQty}
                                onChange={(event) => {
                                  const v = Math.max(0, Math.min(issued, Number(event.target.value) || 0));
                                  setCheckinDrafts((prev) => ({
                                    ...prev,
                                    [order.id]: {
                                      ...(prev[order.id] ?? {}),
                                      [line.id]: {
                                        ...(prev[order.id]?.[line.id] ?? draft),
                                        returnedQty: v,
                                      } as CheckinDraftByLine[string],
                                    },
                                  }));
                                }}
                              />
                            </label>
                            <label className="flex flex-col gap-0.5 text-xs text-[var(--muted)]">
                              Состояние
                              <select
                                className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                                value={condition}
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
                            </label>
                            <label className="flex flex-col gap-0.5 text-xs text-[var(--muted)]">
                              Комментарий
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
                                placeholder="—"
                              />
                            </label>
                          </div>
                          {isMissing ? (
                            <div className="mt-2 flex items-center gap-2">
                              <label className="flex flex-col gap-0.5 text-xs text-[var(--muted)]">
                                Утеряно, шт (пойдёт в список потерь)
                                <input
                                  className="w-20 rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
                                  type="number"
                                  min={0}
                                  max={issued}
                                  value={lostQty}
                                  onChange={(event) => {
                                    const v = Math.max(0, Math.min(issued, Number(event.target.value) || 0));
                                    setCheckinDrafts((prev) => ({
                                      ...prev,
                                      [order.id]: {
                                        ...(prev[order.id] ?? {}),
                                        [line.id]: {
                                          ...(prev[order.id]?.[line.id] ?? draft),
                                          returnedQty: issued - v,
                                        } as CheckinDraftByLine[string],
                                      },
                                    }));
                                  }}
                                />
                              </label>
                              <span className="text-xs text-[var(--muted)]">
                                → в склад вернётся: {returnedQty} шт
                              </span>
                            </div>
                          ) : null}
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
