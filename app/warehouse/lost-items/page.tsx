"use client";

import { useEffect, useRef, useState } from "react";

type LostItemRow = {
  id: string;
  status: "OPEN" | "FOUND" | "WRITTEN_OFF";
  item: { id: string; name: string };
  orderId: string;
  lostQty: number;
  customerTelegramId: string;
  customerNameSnapshot: string | null;
  eventNameSnapshot: string | null;
  note: string | null;
  detectedAt: string;
  resolvedAt: string | null;
};

type LostItemStatus = LostItemRow["status"];

function statusLabel(status: LostItemStatus): string {
  if (status === "OPEN") return "Открыто";
  if (status === "FOUND") return "Найдено";
  return "Списано";
}

export default function WarehouseLostItemsPage() {
  const [rows, setRows] = useState<LostItemRow[]>([]);
  const [status, setStatus] = useState("Загружаем реестр утерянного реквизита...");
  const [filter, setFilter] = useState<LostItemStatus | "ALL">("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  async function loadRows(nextFilter: LostItemStatus | "ALL" = filter) {
    setStatus("Обновляем список...");
    const query = nextFilter === "ALL" ? "" : `?status=${nextFilter}`;
    const response = await fetch(`/api/lost-items${query}`);
    const payload = (await response.json()) as {
      lostItems?: LostItemRow[];
      error?: { message?: string };
    };
    if (!response.ok || !payload.lostItems) {
      setRows([]);
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить список."}`);
      return;
    }
    setRows(payload.lostItems);
    setStatus(`Позиций в реестре: ${payload.lostItems.length}.`);
  }

  async function updateStatus(id: string, nextStatus: LostItemStatus) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/lost-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось обновить статус."}`);
        return;
      }
      await loadRows();
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Утерянный реквизит</h1>
        <div className="flex gap-2">
          <select
            className="ws-btn"
            value={filter}
            onChange={(event) => {
              const next = event.target.value as LostItemStatus | "ALL";
              setFilter(next);
              void loadRows(next);
            }}
          >
            <option value="ALL">Все статусы</option>
            <option value="OPEN">Только открытые</option>
            <option value="FOUND">Найденные</option>
            <option value="WRITTEN_OFF">Списанные</option>
          </select>
          <button className="ws-btn-primary" type="button" onClick={() => void loadRows()}>
            Обновить
          </button>
        </div>
      </div>
      <p className="text-sm text-[var(--muted)]">{status}</p>

      <div className="space-y-3">
        {rows.map((row) => (
          <article key={row.id} className="ws-card border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="text-sm font-semibold">
                  {row.item.name} • {row.lostQty} шт
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Заказчик: {row.customerNameSnapshot ?? row.customerTelegramId}
                  {row.eventNameSnapshot ? ` • ${row.eventNameSnapshot}` : ""}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Заказ: {row.orderId} • Обнаружено: {new Date(row.detectedAt).toLocaleString("ru-RU")}
                </div>
                {row.note ? <div className="text-xs text-[var(--muted)]">Комментарий: {row.note}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-medium">
                  {statusLabel(row.status)}
                </span>
                <button
                  className="ws-btn disabled:opacity-50"
                  type="button"
                  onClick={() => void updateStatus(row.id, "FOUND")}
                  disabled={busyId !== null || row.status === "FOUND"}
                >
                  Найдено
                </button>
                <button
                  className="ws-btn disabled:opacity-50"
                  type="button"
                  onClick={() => void updateStatus(row.id, "WRITTEN_OFF")}
                  disabled={busyId !== null || row.status === "WRITTEN_OFF"}
                >
                  Списать
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
