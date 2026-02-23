"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  name: string;
  availableQty: number;
};

type Customer = {
  id: string;
  name: string;
};

type Role = "GREENWICH" | "WAREHOUSE" | "ADMIN";

type OrderLineDraft = {
  itemId: string;
  requestedQty: number;
};

export default function CreateOrderPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [startDate, setStartDate] = useState("2026-03-01");
  const [endDate, setEndDate] = useState("2026-03-03");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [eventName, setEventName] = useState("");
  const [notes, setNotes] = useState("");
  const [issueImmediately, setIssueImmediately] = useState(true);
  const [lines, setLines] = useState<OrderLineDraft[]>([{ itemId: "", requestedQty: 1 }]);
  const [status, setStatus] = useState("Загрузка...");

  useEffect(() => {
    let ignore = false;
    async function load() {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) {
        if (!ignore) setStatus("Нужна авторизация.");
        return;
      }
      const mePayload = (await meRes.json()) as { user: { role: Role } };
      if (!ignore) {
        setRole(mePayload.user.role);
      }

      const [itemsRes, customersRes] = await Promise.all([
        fetch(`/api/items?startDate=${startDate}&endDate=${endDate}&limit=200`),
        fetch("/api/customers"),
      ]);

      if (itemsRes.ok) {
        const itemsPayload = (await itemsRes.json()) as {
          items: Array<{ id: string; name: string; availableQty: number }>;
        };
        if (!ignore) setItems(itemsPayload.items);
      }
      if (customersRes.ok) {
        const customersPayload = (await customersRes.json()) as {
          customers: Customer[];
        };
        if (!ignore) setCustomers(customersPayload.customers);
      }
      if (!ignore) setStatus("Заполните форму и отправьте заказ.");
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [startDate, endDate]);

  const canUseExternal = role === "WAREHOUSE" || role === "ADMIN";
  const lineOptions = useMemo(
    () => items.map((item) => ({ value: item.id, label: `${item.name} (доступно: ${item.availableQty})` })),
    [items],
  );

  function updateLine(index: number, next: Partial<OrderLineDraft>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...next } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { itemId: "", requestedQty: 1 }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("Отправка...");

    const preparedLines = lines
      .filter((line) => line.itemId && line.requestedQty > 0)
      .map((line) => ({
        itemId: line.itemId,
        requestedQty: Number(line.requestedQty),
      }));

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate,
        endDate,
        customerId: customerId || undefined,
        customerName: customerName || undefined,
        eventName: eventName || null,
        notes: notes || null,
        issueImmediately: canUseExternal ? issueImmediately : false,
        orderSource: canUseExternal ? "WOWSTORG_EXTERNAL" : "GREENWICH_INTERNAL",
        lines: preparedLines,
      }),
    });

    const payload = (await response.json()) as {
      order?: { id: string; status: string };
      error?: { message?: string };
    };
    if (!response.ok || !payload.order) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось создать заказ."}`);
      return;
    }

    setStatus(`Заказ ${payload.order.id} создан, статус: ${payload.order.status}`);
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Новый заказ</h1>
      <p className="text-sm text-zinc-600">{status}</p>

      <form onSubmit={submit} className="space-y-4 rounded border border-zinc-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Start date</span>
            <input className="w-full rounded border border-zinc-300 px-2 py-1" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">End date</span>
            <input className="w-full rounded border border-zinc-300 px-2 py-1" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Заказчик (из базы)</span>
            <select className="w-full rounded border border-zinc-300 px-2 py-1" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">-- выберите --</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Новый заказчик (если нет в списке)</span>
            <input className="w-full rounded border border-zinc-300 px-2 py-1" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Мероприятие (опционально)</span>
            <input className="w-full rounded border border-zinc-300 px-2 py-1" value={eventName} onChange={(event) => setEventName(event.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Комментарий</span>
            <input className="w-full rounded border border-zinc-300 px-2 py-1" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>

        {canUseExternal ? (
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={issueImmediately} onChange={(event) => setIssueImmediately(event.target.checked)} />
            Сразу выдать клиенту (для внешнего заказа WowStorg)
          </label>
        ) : null}

        <div className="space-y-2">
          <div className="text-sm font-medium">Позиции</div>
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
              <select className="rounded border border-zinc-300 px-2 py-1" value={line.itemId} onChange={(event) => updateLine(index, { itemId: event.target.value })}>
                <option value="">-- выберите позицию --</option>
                {lineOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                className="rounded border border-zinc-300 px-2 py-1"
                type="number"
                min={1}
                value={line.requestedQty}
                onChange={(event) => updateLine(index, { requestedQty: Number(event.target.value) })}
              />
              <button type="button" className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100" onClick={() => removeLine(index)} disabled={lines.length === 1}>
                Удалить
              </button>
            </div>
          ))}
          <button type="button" className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100" onClick={addLine}>
            + Добавить позицию
          </button>
        </div>

        <button className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700" type="submit">
          Создать заказ
        </button>
      </form>
    </section>
  );
}
