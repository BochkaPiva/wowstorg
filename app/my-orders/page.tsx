"use client";

import { useState } from "react";

type OrderLine = {
  id: string;
  itemId: string;
  requestedQty: number;
  approvedQty: number | null;
  issuedQty: number | null;
};

type Order = {
  id: string;
  status: string;
  customerName: string | null;
  eventName: string | null;
  orderSource: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  startDate: string;
  endDate: string;
  pickupTime: string | null;
  notes: string | null;
  isEmergency: boolean;
  updatedAt: string;
  lines: OrderLine[];
};

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState("Press Load Orders.");

  async function loadOrders() {
    setStatus("Loading...");
    const response = await fetch("/api/orders/my");
    const payload = (await response.json()) as {
      orders?: Order[];
      error?: { message?: string };
    };

    if (!response.ok || !payload.orders) {
      setOrders([]);
      setStatus(`Error: ${payload.error?.message ?? "Failed to load orders."}`);
      return;
    }

    setOrders(payload.orders);
    setStatus(`Loaded ${payload.orders.length} orders.`);
  }

  async function declareReturn(orderId: string) {
    setStatus("Declaring return...");
    const response = await fetch(`/api/orders/${orderId}/return-declared`, {
      method: "POST",
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Error: ${payload.error?.message ?? "Failed to declare return."}`);
      return;
    }
    setStatus("Return declared.");
    await loadOrders();
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My Orders</h1>
        <button className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700" onClick={loadOrders}>
          Load Orders
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
                  {order.startDate} - {order.endDate} | updated {new Date(order.updatedAt).toLocaleString()}
                </div>
                <div className="text-xs text-zinc-500">
                  customer: {order.customerName ?? "-"} | event: {order.eventName ?? "-"} | source: {order.orderSource}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-zinc-100 px-2 py-1 text-xs">{order.status}</span>
                {order.status === "ISSUED" ? (
                  <button
                    className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                    onClick={() => declareReturn(order.id)}
                  >
                    We returned
                  </button>
                ) : null}
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {order.lines.map((line) => (
                <li key={line.id}>
                  {line.itemId} | requested: {line.requestedQty}, approved: {line.approvedQty ?? "-"}, issued:{" "}
                  {line.issuedQty ?? "-"}
                </li>
              ))}
            </ul>
          </article>
        ))}
        {orders.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
            No orders loaded.
          </div>
        ) : null}
      </div>
    </section>
  );
}
