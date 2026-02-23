"use client";

import { useState } from "react";

type QueueLine = {
  id: string;
  itemId: string;
  itemType: "ASSET" | "BULK" | "CONSUMABLE";
  requestedQty: number;
  approvedQty: number | null;
  issuedQty: number | null;
};

type CheckinCondition = "OK" | "NEEDS_REPAIR" | "BROKEN" | "MISSING";

type CheckinDraftByLineId = Record<
  string,
  {
    checked: boolean;
    condition: CheckinCondition;
    comment: string;
    returnedQty: number;
  }
>;

type QueueOrder = {
  id: string;
  status: string;
  isEmergency: boolean;
  orderSource: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  customerId: string | null;
  customerName: string | null;
  eventName: string | null;
  updatedAt: string;
  updatedMinutesAgo: number;
  startDate: string;
  endDate: string;
  notes: string | null;
  lines: QueueLine[];
};

export default function WarehouseQueuePage() {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [status, setStatus] = useState("Press Load Queue.");
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [expandedCheckinOrderId, setExpandedCheckinOrderId] = useState<string | null>(null);
  const [checkinDrafts, setCheckinDrafts] = useState<Record<string, CheckinDraftByLineId>>({});

  async function loadQueue() {
    setStatus("Loading...");
    const response = await fetch("/api/warehouse/queue");
    const payload = (await response.json()) as {
      orders?: QueueOrder[];
      error?: { message?: string };
    };

    if (!response.ok || !payload.orders) {
      setOrders([]);
      setStatus(`Error: ${payload.error?.message ?? "Failed to load queue."}`);
      return;
    }

    setOrders(payload.orders);
    setStatus(`Loaded ${payload.orders.length} queue orders.`);
  }

  async function approveOrder(order: QueueOrder) {
    setBusyOrderId(order.id);
    setStatus(`Approving ${order.id}...`);

    const response = await fetch(`/api/orders/${order.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: order.lines.map((line) => ({
          orderLineId: line.id,
          approvedQty: line.requestedQty,
        })),
      }),
    });

    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Error: ${payload.error?.message ?? "Approve failed."}`);
      setBusyOrderId(null);
      return;
    }

    setStatus(`Order ${order.id} approved.`);
    setBusyOrderId(null);
    await loadQueue();
  }

  async function issueOrder(order: QueueOrder) {
    setBusyOrderId(order.id);
    setStatus(`Issuing ${order.id}...`);

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
      setStatus(`Error: ${payload.error?.message ?? "Issue failed."}`);
      setBusyOrderId(null);
      return;
    }

    setStatus(`Order ${order.id} issued.`);
    setBusyOrderId(null);
    await loadQueue();
  }

  async function checkinAllOk(order: QueueOrder) {
    const eligibleLines = order.lines.filter((line) => line.itemType === "ASSET" || line.itemType === "BULK");
    const orderDraft = checkinDrafts[order.id] ?? {};
    const selectedLines = eligibleLines.filter((line) => orderDraft[line.id]?.checked);

    if (selectedLines.length === 0) {
      setStatus("Отметьте хотя бы одну позицию для приемки.");
      return;
    }

    setBusyOrderId(order.id);
    setStatus(`Check-in ${order.id}...`);

    const lines = selectedLines.map((line) => {
      const draft = orderDraft[line.id];
      return {
        orderLineId: line.id,
        returnedQty: draft?.returnedQty ?? (line.issuedQty ?? line.approvedQty ?? line.requestedQty),
        condition: draft?.condition ?? "OK",
        comment: draft?.comment?.trim() ? draft.comment.trim() : undefined,
      };
    });

    const response = await fetch(`/api/orders/${order.id}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });

    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Error: ${payload.error?.message ?? "Check-in failed."}`);
      setBusyOrderId(null);
      return;
    }

    setStatus(`Order ${order.id} closed.`);
    setBusyOrderId(null);
    setExpandedCheckinOrderId(null);
    setCheckinDrafts((prev) => {
      const next = { ...prev };
      delete next[order.id];
      return next;
    });
    await loadQueue();
  }

  function prepareCheckinDraft(order: QueueOrder) {
    const existing = checkinDrafts[order.id];
    if (existing) {
      return;
    }

    const eligibleLines = order.lines.filter((line) => line.itemType === "ASSET" || line.itemType === "BULK");
    const draft: CheckinDraftByLineId = {};
    for (const line of eligibleLines) {
      draft[line.id] = {
        checked: true,
        condition: "OK",
        comment: "",
        returnedQty: line.issuedQty ?? line.approvedQty ?? line.requestedQty,
      };
    }
    setCheckinDrafts((prev) => ({ ...prev, [order.id]: draft }));
  }

  function toggleCheckinPanel(order: QueueOrder) {
    if (expandedCheckinOrderId === order.id) {
      setExpandedCheckinOrderId(null);
      return;
    }
    prepareCheckinDraft(order);
    setExpandedCheckinOrderId(order.id);
  }

  function updateCheckinDraft(
    orderId: string,
    lineId: string,
    patch: Partial<{ checked: boolean; condition: CheckinCondition; comment: string; returnedQty: number }>,
  ) {
    setCheckinDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] ?? {}),
        [lineId]: {
          checked: prev[orderId]?.[lineId]?.checked ?? true,
          condition: prev[orderId]?.[lineId]?.condition ?? "OK",
          comment: prev[orderId]?.[lineId]?.comment ?? "",
          returnedQty: prev[orderId]?.[lineId]?.returnedQty ?? 0,
          ...patch,
        },
      },
    }));
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Warehouse Queue</h1>
        <button className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700" onClick={loadQueue}>
          Load Queue
        </button>
      </div>
      <p className="text-sm text-zinc-700">{status}</p>

      <div className="space-y-3">
        {orders.map((order) => (
          <article key={order.id} className="rounded border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{order.id}</div>
                <div className="text-xs text-zinc-500">
                  {order.startDate} - {order.endDate} | updated {order.updatedMinutesAgo} min ago
                </div>
                <div className="text-xs text-zinc-500">
                  customer: {order.customerName ?? "-"} | event: {order.eventName ?? "-"} | source: {order.orderSource}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {order.isEmergency ? (
                  <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-800">EMERGENCY</span>
                ) : null}
                <span className="rounded bg-zinc-100 px-2 py-1 text-xs">{order.status}</span>
                {order.status === "SUBMITTED" ? (
                  <button
                    className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50"
                    onClick={() => approveOrder(order)}
                    disabled={busyOrderId !== null}
                  >
                    {busyOrderId === order.id ? "..." : "Approve"}
                  </button>
                ) : null}
                {order.status === "APPROVED" ? (
                  <button
                    className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50"
                    onClick={() => issueOrder(order)}
                    disabled={busyOrderId !== null}
                  >
                    {busyOrderId === order.id ? "..." : "Issue"}
                  </button>
                ) : null}
                {order.status === "RETURN_DECLARED" || order.status === "ISSUED" ? (
                  <button
                    className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50"
                    onClick={() => toggleCheckinPanel(order)}
                    disabled={busyOrderId !== null}
                  >
                    {expandedCheckinOrderId === order.id ? "Hide check-in" : "Check-in"}
                  </button>
                ) : null}
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {order.lines.map((line) => (
                <li key={line.id}>
                  {line.itemId} ({line.itemType}) | req: {line.requestedQty}, appr:{" "}
                  {line.approvedQty ?? "-"}, issue: {line.issuedQty ?? "-"}
                </li>
              ))}
            </ul>

            {expandedCheckinOrderId === order.id ? (
              <div className="mt-4 rounded border border-zinc-200 bg-zinc-50 p-3">
                <div className="mb-2 text-sm font-medium">Приемка по позициям</div>
                <div className="space-y-3">
                  {order.lines
                    .filter((line) => line.itemType === "ASSET" || line.itemType === "BULK")
                    .map((line) => {
                      const draft = checkinDrafts[order.id]?.[line.id];
                      return (
                        <div key={line.id} className="rounded border border-zinc-200 bg-white p-2">
                          <div className="flex items-center justify-between gap-2">
                            <label className="inline-flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={draft?.checked ?? true}
                                onChange={(event) =>
                                  updateCheckinDraft(order.id, line.id, { checked: event.target.checked })
                                }
                              />
                              <span>
                                {line.itemId} ({line.itemType})
                              </span>
                            </label>
                            <span className="text-xs text-zinc-500">
                              выдано: {line.issuedQty ?? line.approvedQty ?? line.requestedQty}
                            </span>
                          </div>

                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            <label className="text-xs">
                              <span className="mb-1 block text-zinc-600">Количество принято</span>
                              <input
                                className="w-full rounded border border-zinc-300 px-2 py-1"
                                type="number"
                                min={0}
                                max={line.issuedQty ?? line.approvedQty ?? line.requestedQty}
                                value={draft?.returnedQty ?? (line.issuedQty ?? line.approvedQty ?? line.requestedQty)}
                                onChange={(event) =>
                                  updateCheckinDraft(order.id, line.id, {
                                    returnedQty: Number(event.target.value),
                                  })
                                }
                              />
                            </label>
                            <label className="text-xs sm:col-span-2">
                              <span className="mb-1 block text-zinc-600">Состояние</span>
                              <select
                                className="w-full rounded border border-zinc-300 px-2 py-1"
                                value={draft?.condition ?? "OK"}
                                onChange={(event) =>
                                  updateCheckinDraft(order.id, line.id, {
                                    condition: event.target.value as CheckinCondition,
                                  })
                                }
                              >
                                <option value="OK">Нормальное</option>
                                <option value="NEEDS_REPAIR">Требуется ремонт</option>
                                <option value="BROKEN">Утиль / сломано</option>
                                <option value="MISSING">Не возвращено</option>
                              </select>
                            </label>
                          </div>

                          <label className="mt-2 block text-xs">
                            <span className="mb-1 block text-zinc-600">Комментарий (опционально)</span>
                            <input
                              className="w-full rounded border border-zinc-300 px-2 py-1"
                              value={draft?.comment ?? ""}
                              onChange={(event) =>
                                updateCheckinDraft(order.id, line.id, { comment: event.target.value })
                              }
                              placeholder="Например: треснула стойка, царапины, потеряна деталь"
                            />
                          </label>
                        </div>
                      );
                    })}
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
                    onClick={() => checkinAllOk(order)}
                    disabled={busyOrderId !== null}
                  >
                    {busyOrderId === order.id ? "..." : "Подтвердить приемку и закрыть"}
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
        {orders.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
            No queue data loaded.
          </div>
        ) : null}
      </div>
    </section>
  );
}
