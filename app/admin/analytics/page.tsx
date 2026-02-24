"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TopItem = {
  itemId: string;
  name: string;
  qty: number;
  revenue: number;
};

type TopCustomer = {
  customerId: string;
  customerName: string;
  ordersCount: number;
  revenue: number;
  sourceBreakdown: {
    greenwichInternal: number;
    wowstorgExternal: number;
  };
};

function ymd(input: Date): string {
  const year = input.getFullYear();
  const month = `${input.getMonth() + 1}`.padStart(2, "0");
  const day = `${input.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export default function AdminAnalyticsPage() {
  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(ymd(new Date(today.getFullYear(), 0, 1)));
  const [endDate, setEndDate] = useState(ymd(today));
  const [status, setStatus] = useState("Загружаем аналитику...");
  const [loading, setLoading] = useState(false);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);

  async function loadAnalytics() {
    setLoading(true);
    setStatus("Собираем данные...");
    const query = `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    const [itemsResponse, customersResponse] = await Promise.all([
      fetch(`/api/analytics/top-items${query}`),
      fetch(`/api/analytics/top-customers${query}`),
    ]);

    const itemsPayload = (await itemsResponse.json()) as {
      topItems?: TopItem[];
      error?: { message?: string };
    };
    const customersPayload = (await customersResponse.json()) as {
      topCustomers?: TopCustomer[];
      error?: { message?: string };
    };

    if (!itemsResponse.ok || !itemsPayload.topItems) {
      setStatus(`Ошибка топ-позиций: ${itemsPayload.error?.message ?? "не удалось загрузить данные."}`);
      setLoading(false);
      return;
    }
    if (!customersResponse.ok || !customersPayload.topCustomers) {
      setStatus(
        `Ошибка топ-заказчиков: ${customersPayload.error?.message ?? "не удалось загрузить данные."}`,
      );
      setLoading(false);
      return;
    }

    setTopItems(itemsPayload.topItems);
    setTopCustomers(customersPayload.topCustomers);
    setStatus(
      `Период ${startDate} - ${endDate}. Позиций: ${itemsPayload.topItems.length}, заказчиков: ${customersPayload.topCustomers.length}.`,
    );
    setLoading(false);
  }

  useEffect(() => {
    void loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Аналитика</h1>
        <Link href="/admin" className="ws-btn">
          Назад
        </Link>
      </div>

      <div className="ws-card border p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">С даты</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">По дату</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <button
            className="ws-btn self-end"
            type="button"
            onClick={() => {
              const now = new Date();
              setStartDate(ymd(new Date(now.getFullYear(), 0, 1)));
              setEndDate(ymd(now));
            }}
            disabled={loading}
          >
            YTD
          </button>
          <button className="ws-btn-primary self-end" type="button" onClick={() => void loadAnalytics()} disabled={loading}>
            {loading ? "..." : "Обновить"}
          </button>
        </div>
      </div>

      <p className="text-sm text-[var(--muted)]">{status}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="ws-card border p-3">
          <h2 className="mb-2 text-sm font-semibold">Топ реквизита по выручке</h2>
          <div className="space-y-2">
            {topItems.slice(0, 20).map((item, index) => (
              <div key={item.itemId} className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {index + 1}. {item.name}
                  </div>
                  <div className="text-xs text-[var(--muted)]">Выдач (шт): {item.qty}</div>
                </div>
                <div className="ml-2 text-right font-semibold">{formatMoney(item.revenue)} ₽</div>
              </div>
            ))}
          </div>
        </article>

        <article className="ws-card border p-3">
          <h2 className="mb-2 text-sm font-semibold">Топ заказчиков по выручке</h2>
          <div className="space-y-2">
            {topCustomers.slice(0, 20).map((customer, index) => (
              <div
                key={customer.customerId}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 truncate font-medium">
                    {index + 1}. {customer.customerName}
                  </div>
                  <div className="ml-2 text-right font-semibold">{formatMoney(customer.revenue)} ₽</div>
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  Заказов: {customer.ordersCount} • Greenwich:{" "}
                  {formatMoney(customer.sourceBreakdown.greenwichInternal)} ₽ • WowStorg:{" "}
                  {formatMoney(customer.sourceBreakdown.wowstorgExternal)} ₽
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
