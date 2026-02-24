"use client";

import { useEffect, useMemo, useState } from "react";

type RentedRow = {
  orderId: string;
  itemId: string;
  itemName: string;
  itemType: "ASSET" | "BULK" | "CONSUMABLE";
  qty: number;
  startDate: string;
  endDate: string;
  customerName: string;
};

function itemTypeLabel(value: RentedRow["itemType"]): string {
  if (value === "ASSET") return "Штучный";
  if (value === "BULK") return "Массовый";
  return "Расходник";
}

export default function WarehouseRentedItemsPage() {
  const [rows, setRows] = useState<RentedRow[]>([]);
  const [status, setStatus] = useState("Загрузка...");
  const [search, setSearch] = useState("");

  async function loadRows() {
    setStatus("Обновляем...");
    const response = await fetch("/api/warehouse/rented-items");
    const payload = (await response.json()) as { rows?: RentedRow[]; error?: { message?: string } };
    if (!response.ok || !payload.rows) {
      setRows([]);
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить список."}`);
      return;
    }
    setRows(payload.rows);
    setStatus(payload.rows.length === 0 ? "Сейчас нет позиций в аренде." : `Позиций в аренде: ${payload.rows.length}.`);
  }

  useEffect(() => {
    void loadRows();
  }, []);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      `${row.itemName} ${row.customerName} ${row.orderId}`.toLowerCase().includes(term),
    );
  }, [rows, search]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Сдано в аренду</h1>
        <button className="ws-btn" type="button" onClick={() => { globalThis.location.href = "/warehouse/inventory"; }}>
          Назад
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">{status}</p>

      <div className="flex gap-2">
        <input
          className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
          placeholder="Поиск: позиция, заказчик, ID заказа"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className="ws-btn-primary" type="button" onClick={() => void loadRows()}>
          Обновить
        </button>
      </div>

      <div className="space-y-2">
        {visibleRows.map((row) => (
          <article key={`${row.orderId}-${row.itemId}`} className="ws-card border p-3">
            <div className="text-sm font-semibold">{row.itemName} • {row.qty} шт</div>
            <div className="text-xs text-[var(--muted)]">
              Тип: {itemTypeLabel(row.itemType)} • Заказчик: {row.customerName}
            </div>
            <div className="text-xs text-[var(--muted)]">
              Период: {row.startDate} - {row.endDate} • Заказ: {row.orderId}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
