"use client";

import { FormEvent, useState } from "react";

type ItemRow = {
  id: string;
  name: string;
  itemType: string;
  availabilityStatus: string;
  stockTotal: number;
  reservedQty: number;
  availableQty: number;
  pricePerDay: number;
  pricePerDayDiscounted: number;
  locationText: string | null;
};

export default function CatalogPage() {
  const [startDate, setStartDate] = useState("2026-03-01");
  const [endDate, setEndDate] = useState("2026-03-03");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [status, setStatus] = useState("Use filters and press Load Items.");

  async function loadItems(event?: FormEvent) {
    event?.preventDefault();
    setStatus("Loading...");

    const params = new URLSearchParams({
      startDate,
      endDate,
      limit: "200",
    });
    if (search.trim()) {
      params.set("search", search.trim());
    }

    const response = await fetch(`/api/items?${params.toString()}`);
    const payload = (await response.json()) as {
      items?: ItemRow[];
      error?: { message?: string };
    };

    if (!response.ok || !payload.items) {
      setItems([]);
      setStatus(`Error: ${payload.error?.message ?? "Failed to load items."}`);
      return;
    }

    setItems(payload.items);
    setStatus(`Loaded ${payload.items.length} items.`);
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Catalog</h1>

      <form onSubmit={loadItems} className="grid gap-3 rounded border border-zinc-200 bg-white p-4 sm:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Start date</span>
          <input
            className="w-full rounded border border-zinc-300 px-2 py-1"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            type="date"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">End date</span>
          <input
            className="w-full rounded border border-zinc-300 px-2 py-1"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            type="date"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Search</span>
          <input
            className="w-full rounded border border-zinc-300 px-2 py-1"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Item name, description, location"
          />
        </label>
        <div className="sm:col-span-4">
          <button className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700" type="submit">
            Load Items
          </button>
        </div>
      </form>

      <p className="text-sm text-zinc-700">{status}</p>

      <div className="overflow-x-auto rounded border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-100">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="px-3 py-2 text-right">Reserved</th>
              <th className="px-3 py-2 text-right">Available</th>
              <th className="px-3 py-2 text-right">Price/day</th>
              <th className="px-3 py-2 text-right">-30%</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-zinc-200">
                <td className="px-3 py-2">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-zinc-500">{item.locationText ?? "-"}</div>
                </td>
                <td className="px-3 py-2">{item.itemType}</td>
                <td className="px-3 py-2">{item.availabilityStatus}</td>
                <td className="px-3 py-2 text-right">{item.stockTotal}</td>
                <td className="px-3 py-2 text-right">{item.reservedQty}</td>
                <td className="px-3 py-2 text-right font-semibold">{item.availableQty}</td>
                <td className="px-3 py-2 text-right">{item.pricePerDay}</td>
                <td className="px-3 py-2 text-right">{item.pricePerDayDiscounted}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-zinc-500" colSpan={8}>
                  No data loaded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
