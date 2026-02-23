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
    setBusyOrderId(order.id);
    setStatus(`Check-in ${order.id}...`);

    const lines = order.lines
      .filter((line) => line.itemType === "ASSET" || line.itemType === "BULK")
      .map((line) => ({
        orderLineId: line.id,
        returnedQty: line.issuedQty ?? line.approvedQty ?? line.requestedQty,
        condition: "OK",
      }));

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
    await loadQueue();
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
                {order.status === "RETURN_DECLARED" ? (
                  <button
                    className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50"
                    onClick={() => checkinAllOk(order)}
                    disabled={busyOrderId !== null}
                  >
                    {busyOrderId === order.id ? "..." : "Check-in all OK"}
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
