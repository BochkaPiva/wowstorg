"use client";

import { useEffect, useRef, useState } from "react";

type ProblemItem = {
  id: string;
  name: string;
  availabilityStatus: "ACTIVE" | "NEEDS_REPAIR" | "BROKEN" | "MISSING" | "RETIRED";
  stockTotal: number;
  stockInRepair: number;
  stockBroken: number;
  stockMissing: number;
  updatedAt: string;
  locationText: string | null;
};

export default function WarehouseRepairsPage() {
  const [items, setItems] = useState<ProblemItem[]>([]);
  const [status, setStatus] = useState("Загружаем проблемный реквизит...");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
  const hasLoadedRef = useRef(false);

  async function loadItems() {
    setStatus("Обновляем список...");
    const response = await fetch("/api/problem-items");
    const payload = (await response.json()) as {
      items?: ProblemItem[];
      error?: { message?: string };
    };
    if (!response.ok || !payload.items) {
      setItems([]);
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить список."}`);
      return;
    }
    const rows = payload.items;
    setItems(rows);
    setStatus(`Проблемных позиций: ${rows.length}`);
    setQtyByItem((prev) => {
      const next = { ...prev };
      for (const item of rows) {
        if (!next[item.id]) {
          next[item.id] = 1;
        }
      }
      return next;
    });
  }

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void loadItems();
  }, []);

  async function runAction(itemId: string, action: "REPAIR" | "WRITE_OFF") {
    const quantity = Math.max(1, Number(qtyByItem[itemId] ?? 1));
    setBusyId(itemId);
    try {
      const response = await fetch("/api/problem-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action, quantity }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setStatus(`Ошибка: ${payload.error?.message ?? "Операция не выполнена."}`);
        return;
      }
      await loadItems();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Ремонт и списание</h1>
        <button className="ws-btn-primary" onClick={() => void loadItems()} type="button">
          Обновить
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">{status}</p>

      <div className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="ws-card border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold">{item.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  Статус: {item.availabilityStatus} • Всего: {item.stockTotal} • Ремонт: {item.stockInRepair} •
                  Сломано: {item.stockBroken} • Утеряно: {item.stockMissing}
                </div>
                {item.locationText ? (
                  <div className="text-xs text-[var(--muted)]">Локация: {item.locationText}</div>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <input
                  className="w-20 rounded-xl border border-[var(--border)] px-2 py-1 text-sm"
                  type="number"
                  min={1}
                  value={qtyByItem[item.id] ?? 1}
                  onChange={(event) =>
                    setQtyByItem((prev) => ({
                      ...prev,
                      [item.id]: Math.max(1, Number(event.target.value)),
                    }))
                  }
                />
                <button
                  className="ws-btn disabled:opacity-50"
                  type="button"
                  onClick={() => void runAction(item.id, "REPAIR")}
                  disabled={busyId !== null}
                >
                  Починить
                </button>
                <button
                  className="ws-btn disabled:opacity-50"
                  type="button"
                  onClick={() => void runAction(item.id, "WRITE_OFF")}
                  disabled={busyId !== null}
                >
                  Утилизировать
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
