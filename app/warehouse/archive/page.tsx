"use client";

import { useEffect, useMemo, useState } from "react";

type ArchiveStatus = "ALL" | "CLOSED" | "CANCELLED";
type ArchiveSource = "ALL" | "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";

type Customer = {
  id: string;
  name: string;
};

type ArchiveLine = {
  id: string;
  itemId: string;
  itemType: "ASSET" | "BULK" | "CONSUMABLE";
  requestedQty: number;
  approvedQty: number | null;
  issuedQty: number | null;
};

type ArchiveOrder = {
  id: string;
  status: "CLOSED" | "CANCELLED";
  orderSource: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  customerId: string | null;
  customerName: string | null;
  eventName: string | null;
  startDate: string;
  endDate: string;
  notes: string | null;
  updatedAt: string;
  closedAt: string | null;
  lines: ArchiveLine[];
};

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
      const payload = (await response.json()) as {
        customers?: Customer[];
        error?: { message?: string };
      };

      if (!response.ok || !payload.customers) {
        if (!ignore) {
          setStatusText(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить заказчиков."}`);
        }
        return;
      }

      if (!ignore) {
        setCustomers(payload.customers);
        setStatusText("Нажмите Load Archive.");
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
    if (customerId) {
      params.set("customerId", customerId);
    }
    if (search.trim().length > 0) {
      params.set("search", search.trim());
    }
    return params.toString();
  }, [status, source, startDate, endDate, customerId, search]);

  async function loadArchive() {
    setLoading(true);
    setStatusText("Загрузка архива...");

    const response = await fetch(`/api/warehouse/archive?${queryString}`);
    const payload = (await response.json()) as {
      orders?: ArchiveOrder[];
      error?: { message?: string };
    };

    if (!response.ok || !payload.orders) {
      setOrders([]);
      setStatusText(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить архив."}`);
      setLoading(false);
      return;
    }

    setOrders(payload.orders);
    setStatusText(`Загружено ${payload.orders.length} архивных заказов.`);
    setLoading(false);
  }

  function exportCsv() {
    const url = `/api/warehouse/archive?${queryString}&format=csv`;
    globalThis.location.href = url;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Warehouse Archive</h1>
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50"
            onClick={exportCsv}
            type="button"
            disabled={loading}
          >
            Export CSV
          </button>
          <button
            className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
            onClick={loadArchive}
            type="button"
            disabled={loading}
          >
            {loading ? "..." : "Load Archive"}
          </button>
        </div>
      </div>

      <p className="text-sm text-zinc-700">{statusText}</p>

      <div className="grid gap-3 rounded border border-zinc-200 bg-white p-3 md:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Status</span>
          <select
            className="w-full rounded border border-zinc-300 px-2 py-1"
            value={status}
            onChange={(event) => setStatus(event.target.value as ArchiveStatus)}
          >
            <option value="ALL">ALL</option>
            <option value="CLOSED">CLOSED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">Source</span>
          <select
            className="w-full rounded border border-zinc-300 px-2 py-1"
            value={source}
            onChange={(event) => setSource(event.target.value as ArchiveSource)}
          >
            <option value="ALL">ALL</option>
            <option value="GREENWICH_INTERNAL">GREENWICH_INTERNAL</option>
            <option value="WOWSTORG_EXTERNAL">WOWSTORG_EXTERNAL</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">Customer</span>
          <select
            className="w-full rounded border border-zinc-300 px-2 py-1"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">ALL</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">Start date</span>
          <input
            className="w-full rounded border border-zinc-300 px-2 py-1"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">End date</span>
          <input
            className="w-full rounded border border-zinc-300 px-2 py-1"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">Search</span>
          <input
            className="w-full rounded border border-zinc-300 px-2 py-1"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="id, event, customer, notes"
          />
        </label>
      </div>

      <div className="space-y-3">
        {orders.map((order) => (
          <article key={order.id} className="rounded border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{order.id}</div>
                <div className="text-xs text-zinc-500">
                  {order.startDate} - {order.endDate} | source: {order.orderSource}
                </div>
                <div className="text-xs text-zinc-500">
                  customer: {order.customerName ?? "-"} | event: {order.eventName ?? "-"}
                </div>
                <div className="text-xs text-zinc-500">
                  updated: {new Date(order.updatedAt).toLocaleString()} | closed:{" "}
                  {order.closedAt ? new Date(order.closedAt).toLocaleString() : "-"}
                </div>
              </div>
              <span className="rounded bg-zinc-100 px-2 py-1 text-xs">{order.status}</span>
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
            Archive is empty for current filters.
          </div>
        ) : null}
      </div>
    </section>
  );
}
