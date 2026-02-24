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

function availabilityStatusLabel(
  s: ProblemItem["availabilityStatus"],
  item?: { stockInRepair: number; stockBroken: number; stockMissing: number },
): string {
  switch (s) {
    case "NEEDS_REPAIR":
      return "Требуется ремонт";
    case "BROKEN":
      return "Сломано";
    case "MISSING":
      return "Утеряно";
    case "RETIRED":
      return "Списано";
    case "ACTIVE":
      if (item && (item.stockInRepair + item.stockBroken > 0)) {
        return "Доступна (есть единицы в ремонте/сломано)";
      }
      return "Доступна";
    default:
      return String(s);
  }
}

export default function WarehouseRepairsPage() {
  const [items, setItems] = useState<ProblemItem[]>([]);
  const [status, setStatus] = useState("Загружаем проблемный реквизит...");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
  const hasLoadedRef = useRef(false);

  async function loadItems() {
    setStatus("Обновляем список...");
    let response: Response;
    try {
      response = await fetch("/api/problem-items");
    } catch {
      setItems([]);
      setStatus("Ошибка сети при загрузке списка.");
      return;
    }
    const payload = (await response.json().catch(() => null)) as {
      items?: ProblemItem[];
      error?: { message?: string };
    } | null;
    if (!response.ok || !payload?.items) {
      setItems([]);
      setStatus(`Ошибка: ${payload?.error?.message ?? "Не удалось загрузить список."}`);
      return;
    }
    const rows = payload.items;
    setItems(rows);
    setStatus(rows.length === 0 ? "Список пуст: проблемных позиций пока нет." : `Проблемных позиций: ${rows.length}`);
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

  async function runAction(
    itemId: string,
    action: "REPAIR" | "WRITE_OFF" | "WRITE_OFF_MISSING",
  ) {
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
        <div className="flex items-center gap-2">
          <button className="ws-btn" onClick={() => { globalThis.location.href = "/"; }} type="button">
            Назад
          </button>
          <button className="ws-btn-primary" onClick={() => void loadItems()} type="button">
            Обновить
          </button>
        </div>
      </div>
      <p className="text-sm text-[var(--muted)]">{status}</p>

      <div className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="ws-card border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold">{item.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  Статус: {availabilityStatusLabel(item.availabilityStatus, item)} • Всего: {item.stockTotal} • Ремонт:{" "}
                  {item.stockInRepair} • Сломано: {item.stockBroken} • Утеряно: {item.stockMissing}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-[var(--muted)]">
                  Кол-во:
                  <input
                    className="ml-1 w-14 rounded-xl border border-[var(--border)] px-2 py-1 text-sm"
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
                </label>
                {item.stockInRepair + item.stockBroken > 0 ? (
                  <>
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
                  </>
                ) : null}
                {item.stockMissing > 0 ? (
                  <button
                    className="ws-btn disabled:opacity-50"
                    type="button"
                    onClick={() => void runAction(item.id, "WRITE_OFF_MISSING")}
                    disabled={busyId !== null}
                  >
                    Списать утерю
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
