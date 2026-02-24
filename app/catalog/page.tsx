"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = "all" | "categories" | "kits";
type Role = "GREENWICH" | "WAREHOUSE" | "ADMIN";
type OrderSource = "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
type ItemRow = {
  id: string;
  name: string;
  itemType: string;
  availabilityStatus: string;
  stockTotal: number;
  availableQty: number;
  pricePerDay: number;
  categories?: Array<{ id: string; name: string }>;
};
type Category = { id: string; name: string; itemCount: number };
type Kit = {
  id: string;
  name: string;
  description: string | null;
  lines: Array<{ defaultQty: number; item: { id: string; name: string } }>;
};
type CartLine = { itemId: string; name: string; qty: number };
type Customer = { id: string; name: string };

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
  const [cart, setCart] = useState<CartLine[]>([]);

  useEffect(() => {
    const raw = globalThis.localStorage.getItem("catalog-cart-v2");
    if (raw) setCart(JSON.parse(raw) as CartLine[]);
  }, []);

  useEffect(() => {
    globalThis.localStorage.setItem("catalog-cart-v2", JSON.stringify(cart));
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
      if (!ignore) setStatus("Каталог готов. Наберите корзину и оформите заявку.");
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [startDate, endDate, search]);

  function addItem(item: ItemRow, qty = 1) {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.itemId === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [...prev, { itemId: item.id, name: item.name, qty }];
    });
  }

  function addKit(kit: Kit) {
    for (const line of kit.lines) {
      addItem({ id: line.item.id, name: line.item.name, itemType: "", availabilityStatus: "", stockTotal: 0, availableQty: 0, pricePerDay: 0 }, line.defaultQty);
    }
    setStatus(`Пакет "${kit.name}" добавлен в корзину.`);
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
        orderSource,
        issueImmediately: false,
        lines: cart.map((x) => ({ itemId: x.itemId, requestedQty: x.qty })),
      }),
    });
    const payload = (await response.json()) as { order?: { id: string; status: string }; error?: { message?: string } };
    if (!response.ok || !payload.order) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось создать заявку."}`);
      return;
    }
    setCart([]);
    setStatus(`Заявка ${payload.order.id} создана. Статус: ${payload.order.status}`);
  }

  const visibleItems = useMemo(
    () => (selectedCategoryId ? items.filter((x) => x.categories?.some((c) => c.id === selectedCategoryId)) : items),
    [items, selectedCategoryId],
  );

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Каталог</h1>
      <p className="text-sm text-zinc-700">{status}</p>

      <div className="grid gap-2 rounded border border-zinc-200 bg-white p-3 sm:grid-cols-3">
        <input className="rounded border border-zinc-300 px-2 py-1 text-sm" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input className="rounded border border-zinc-300 px-2 py-1 text-sm" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <input className="rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Поиск по позициям" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={`rounded px-3 py-1 text-sm ${tab === "all" ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white"}`} onClick={() => setTab("all")} type="button">Все позиции</button>
        <button className={`rounded px-3 py-1 text-sm ${tab === "categories" ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white"}`} onClick={() => setTab("categories")} type="button">Категории</button>
        <button className={`rounded px-3 py-1 text-sm ${tab === "kits" ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white"}`} onClick={() => setTab("kits")} type="button">Пакеты</button>
      </div>

      {tab === "categories" ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <button key={category.id} type="button" onClick={() => { setSelectedCategoryId(category.id); setTab("all"); }} className="rounded border border-zinc-200 bg-white p-3 text-left hover:bg-zinc-50">
              <div className="font-medium">{category.name}</div>
              <div className="text-xs text-zinc-500">Позиции: {category.itemCount}</div>
            </button>
          ))}
        </div>
      ) : null}

      {tab === "kits" ? (
        <div className="space-y-2">
          {kits.map((kit) => (
            <div key={kit.id} className="rounded border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{kit.name}</div>
                  <div className="text-xs text-zinc-500">{kit.description ?? "Без описания"}</div>
                </div>
                <button className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100" type="button" onClick={() => addKit(kit)}>
                  Добавить пакет
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "all" ? (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <div key={item.id} className="rounded border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-zinc-500">{item.itemType} | доступно: {item.availableQty}</div>
                </div>
                <button className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100" type="button" onClick={() => addItem(item)}>
                  В корзину
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-3 rounded border border-zinc-200 bg-white p-3">
        <div className="font-medium">Корзина ({cart.length})</div>
        {cart.map((line) => (
          <div key={line.itemId} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
            <div className="text-sm">{line.name}</div>
            <input className="rounded border border-zinc-300 px-2 py-1 text-sm" type="number" min={1} value={line.qty} onChange={(e) => setCart((prev) => prev.map((x) => x.itemId === line.itemId ? { ...x, qty: Number(e.target.value) } : x))} />
            <button className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100" type="button" onClick={() => setCart((prev) => prev.filter((x) => x.itemId !== line.itemId))}>
              Удалить
            </button>
          </div>
        ))}
        {cart.length === 0 ? <div className="text-sm text-zinc-500">Корзина пуста.</div> : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <select className="rounded border border-zinc-300 px-2 py-1 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Заказчик из базы</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input className="rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Новый заказчик (если нет в базе)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <input className="rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Мероприятие (опционально)" value={eventName} onChange={(e) => setEventName(e.target.value)} />
          <button className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50" type="button" onClick={() => void submitOrder()} disabled={cart.length === 0}>
            Оформить заявку
          </button>
        </div>
      </div>
    </section>
  );
}
