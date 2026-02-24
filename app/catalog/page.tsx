"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = "all" | "categories" | "kits";
type Role = "GREENWICH" | "WAREHOUSE" | "ADMIN";
type OrderSource = "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";

type ItemRow = {
  id: string;
  name: string;
  itemType: string;
  availabilityStatus: "ACTIVE" | "NEEDS_REPAIR" | "BROKEN" | "MISSING" | string;
  availableQty: number;
  categories?: Array<{ id: string; name: string }>;
  imageUrls?: string[];
};

type Category = { id: string; name: string; itemCount: number };
type Kit = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl?: string | null;
  lines: Array<{ defaultQty: number; item: { id: string; name: string } }>;
};
type CartLine = { itemId: string; name: string; qty: number };
type Customer = { id: string; name: string };

function statusDot(status: string): string {
  if (status === "ACTIVE") return "bg-emerald-500";
  if (status === "NEEDS_REPAIR") return "bg-amber-500";
  if (status === "BROKEN") return "bg-red-500";
  if (status === "MISSING") return "bg-zinc-400";
  return "bg-zinc-300";
}

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [status, setStatus] = useState("Загрузка каталога...");
  const [role, setRole] = useState<Role | null>(null);
  const [startDate, setStartDate] = useState("2026-03-01");
  const [endDate, setEndDate] = useState("2026-03-03");
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const [items, setItems] = useState<ItemRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [eventName, setEventName] = useState("");
  const [notes, setNotes] = useState("");

  const [cart, setCart] = useState<CartLine[]>([]);
  const [lastCreatedOrderId, setLastCreatedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const raw = globalThis.localStorage.getItem("catalog-cart-v3");
    if (raw) setCart(JSON.parse(raw) as CartLine[]);
  }, []);

  useEffect(() => {
    globalThis.localStorage.setItem("catalog-cart-v3", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) {
        if (!ignore) setStatus("Нужна авторизация.");
        return;
      }
      const me = (await meRes.json()) as { user: { role: Role } };
      if (!ignore) setRole(me.user.role);

      const [iRes, cRes, kRes, custRes] = await Promise.all([
        fetch(`/api/items?startDate=${startDate}&endDate=${endDate}&search=${encodeURIComponent(search)}&limit=300`),
        fetch("/api/categories"),
        fetch(`/api/kits?startDate=${startDate}&endDate=${endDate}`),
        fetch("/api/customers"),
      ]);
      if (iRes.ok) setItems(((await iRes.json()) as { items: ItemRow[] }).items);
      if (cRes.ok) setCategories(((await cRes.json()) as { categories: Category[] }).categories);
      if (kRes.ok) setKits(((await kRes.json()) as { kits: Kit[] }).kits);
      if (custRes.ok) setCustomers(((await custRes.json()) as { customers: Customer[] }).customers);
      if (!ignore) setStatus("Каталог готов. Соберите корзину и оформите заявку.");
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [startDate, endDate, search]);

  function addItem(item: ItemRow, qty = 1) {
    setCart((prev) => {
      const index = prev.findIndex((entry) => entry.itemId === item.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = { ...next[index], qty: next[index].qty + qty };
        return next;
      }
      return [...prev, { itemId: item.id, name: item.name, qty }];
    });
  }

  function addKit(kit: Kit) {
    for (const line of kit.lines) {
      addItem(
        {
          id: line.item.id,
          name: line.item.name,
          itemType: "",
          availabilityStatus: "ACTIVE",
          availableQty: 0,
        },
        line.defaultQty,
      );
    }
    setStatus(`Пакет «${kit.name}» добавлен в корзину.`);
  }

  async function submitOrder() {
    if (cart.length === 0) {
      setStatus("Корзина пуста.");
      return;
    }
    setStatus("Оформляем заявку...");
    const orderSource: OrderSource = role === "GREENWICH" ? "GREENWICH_INTERNAL" : "WOWSTORG_EXTERNAL";
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
        orderSource,
        issueImmediately: false,
        lines: cart.map((line) => ({ itemId: line.itemId, requestedQty: line.qty })),
      }),
    });
    const payload = (await response.json()) as { order?: { id: string; status: string }; error?: { message?: string } };
    if (!response.ok || !payload.order) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось создать заявку."}`);
      return;
    }
    setCart([]);
    setLastCreatedOrderId(payload.order.id);
    setStatus(`Заявка ${payload.order.id} оформлена. Переходим в «Мои заявки»...`);
    globalThis.setTimeout(() => {
      globalThis.location.href = "/my-orders";
    }, 900);
  }

  const visibleItems = useMemo(
    () => (selectedCategoryId ? items.filter((item) => item.categories?.some((cat) => cat.id === selectedCategoryId)) : items),
    [items, selectedCategoryId],
  );

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--brand)]">Каталог и оформление заявки</h1>
      <p className="text-sm text-[var(--muted)]">{status}</p>
      {lastCreatedOrderId ? (
        <div className="ws-card border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Заявка {lastCreatedOrderId} успешно оформлена.
        </div>
      ) : null}

      <div className="ws-card grid gap-2 p-3 sm:grid-cols-3">
        <input
          className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
        <input
          className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
        <input
          className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
          placeholder="Поиск по позициям"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <details className="ws-card p-3">
        <summary className="cursor-pointer text-sm font-medium text-[var(--brand)]">Легенда статусов</summary>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> активна</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-amber-500" /> нужен ремонт</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-red-500" /> сломана</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-zinc-400" /> отсутствует</span>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <button className={tab === "all" ? "ws-btn-primary" : "ws-btn"} type="button" onClick={() => setTab("all")}>
          Все позиции
        </button>
        <button className={tab === "categories" ? "ws-btn-primary" : "ws-btn"} type="button" onClick={() => setTab("categories")}>
          Подборки
        </button>
        <button className={tab === "kits" ? "ws-btn-primary" : "ws-btn"} type="button" onClick={() => setTab("kits")}>
          Пакеты
        </button>
      </div>

      {tab === "categories" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <button
              key={category.id}
              className="ws-card p-4 text-left hover:bg-violet-50"
              type="button"
              onClick={() => {
                setSelectedCategoryId(category.id);
                setTab("all");
              }}
            >
              <div className="font-medium">{category.name}</div>
              <div className="text-xs text-[var(--muted)]">Позиций: {category.itemCount}</div>
            </button>
          ))}
        </div>
      ) : null}

      {tab === "kits" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {kits.map((kit) => (
            <div key={kit.id} className="ws-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{kit.name}</div>
                  <div className="text-xs text-[var(--muted)]">{kit.description ?? "Без описания"}</div>
                  <div className="mt-2 text-xs text-[var(--muted)]">
                    {kit.lines.slice(0, 4).map((line) => `${line.item.name} x${line.defaultQty}`).join(", ")}
                    {kit.lines.length > 4 ? ` +${kit.lines.length - 4}` : ""}
                  </div>
                </div>
                <button className="ws-btn" type="button" onClick={() => addKit(kit)}>
                  В корзину
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "all" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleItems.map((item) => (
            <div key={item.id} className="ws-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="inline-flex items-center gap-2 font-medium">
                    <i className={`h-2.5 w-2.5 rounded-full ${statusDot(item.availabilityStatus)}`} />
                    {item.name}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {item.itemType} • доступно: {item.availableQty}
                  </div>
                </div>
                <button className="ws-btn" type="button" onClick={() => addItem(item)}>
                  В корзину
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="ws-card space-y-3 p-3">
        <div className="font-semibold">Корзина ({cart.length})</div>
        {cart.length === 0 ? <div className="text-sm text-[var(--muted)]">Корзина пока пустая.</div> : null}
        {cart.map((line) => (
          <div key={line.itemId} className="grid grid-cols-[1fr_90px_auto] items-center gap-2">
            <div className="text-sm">{line.name}</div>
            <input
              className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm"
              type="number"
              min={1}
              value={line.qty}
              onChange={(event) =>
                setCart((prev) =>
                  prev.map((entry) =>
                    entry.itemId === line.itemId ? { ...entry, qty: Math.max(1, Number(event.target.value)) } : entry,
                  ),
                )
              }
            />
            <button className="ws-btn" type="button" onClick={() => setCart((prev) => prev.filter((entry) => entry.itemId !== line.itemId))}>
              Удалить
            </button>
          </div>
        ))}

        <div className="grid gap-2 sm:grid-cols-2">
          <select
            className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">Заказчик из базы</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
            placeholder="Новый заказчик (если нет в базе)"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
          <input
            className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
            placeholder="Мероприятие (опционально)"
            value={eventName}
            onChange={(event) => setEventName(event.target.value)}
          />
          <input
            className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
            placeholder="Комментарий (опционально)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <button className="ws-btn-primary disabled:opacity-50" type="button" onClick={() => void submitOrder()} disabled={cart.length === 0}>
            Оформить заявку
          </button>
        </div>
      </div>
    </section>
  );
}
