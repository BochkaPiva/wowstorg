"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = "all" | "categories" | "kits";
type Role = "GREENWICH" | "WAREHOUSE" | "ADMIN";
type ItemStatus = "ACTIVE" | "NEEDS_REPAIR" | "BROKEN" | "MISSING" | string;

type ItemRow = {
  id: string;
  name: string;
  itemType: string;
  availabilityStatus: ItemStatus;
  availableQty: number;
  pricePerDay: number;
  pricePerDayDiscounted: number;
  categories?: Array<{ id: string; name: string }>;
};

type Category = { id: string; name: string; itemCount: number };
type Kit = {
  id: string;
  name: string;
  description: string | null;
  lines: Array<{
    defaultQty: number;
    item: { id: string; name: string; pricePerDay: number; pricePerDayDiscounted: number };
  }>;
};
type CartLine = { itemId: string; name: string; qty: number };
type Customer = { id: string; name: string };

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
}

function calcDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diffMs = end.getTime() - start.getTime();
  const days = Math.round(diffMs / 86400000);
  return Number.isFinite(days) && days > 0 ? days : 1;
}

function toDateInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function getVisualStatus(item: ItemRow): { dot: string; label: string } {
  if (item.availabilityStatus === "BROKEN") return { dot: "bg-red-500", label: "Сломано" };
  if (item.availabilityStatus === "MISSING") return { dot: "bg-zinc-500", label: "Отсутствует" };
  if (item.availabilityStatus === "NEEDS_REPAIR") return { dot: "bg-amber-500", label: "Требуется ремонт" };
  if (item.availableQty <= 0) return { dot: "bg-orange-500", label: "Занято на выбранные даты" };
  return { dot: "bg-emerald-500", label: "Доступно" };
}

function canAddToCart(item: ItemRow): boolean {
  return item.availabilityStatus === "ACTIVE" && item.availableQty > 0;
}

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [status, setStatus] = useState("Загрузка каталога...");
  const [role, setRole] = useState<Role | null>(null);
  const [startDate, setStartDate] = useState(() => toDateInputValue(new Date()));
  const [endDate, setEndDate] = useState(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    return toDateInputValue(next);
  });
  const [readyByDate, setReadyByDate] = useState(() => toDateInputValue(new Date()));
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
  const [deliveryRequested, setDeliveryRequested] = useState(false);
  const [deliveryComment, setDeliveryComment] = useState("");
  const [mountRequested, setMountRequested] = useState(false);
  const [mountComment, setMountComment] = useState("");
  const [dismountRequested, setDismountRequested] = useState(false);
  const [dismountComment, setDismountComment] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartQtyEdit, setCartQtyEdit] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  useEffect(() => {
    const raw = globalThis.localStorage.getItem("catalog-cart-v4");
    if (raw) setCart(JSON.parse(raw) as CartLine[]);
  }, []);

  useEffect(() => {
    globalThis.localStorage.setItem("catalog-cart-v4", JSON.stringify(cart));
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
        fetch(
          `/api/items?startDate=${startDate}&endDate=${endDate}&search=${encodeURIComponent(search)}&limit=300`,
        ),
        fetch("/api/categories"),
        fetch(`/api/kits?startDate=${startDate}&endDate=${endDate}`),
        fetch("/api/customers"),
      ]);
      if (iRes.ok) setItems(((await iRes.json()) as { items: ItemRow[] }).items);
      if (cRes.ok) setCategories(((await cRes.json()) as { categories: Category[] }).categories);
      if (kRes.ok) setKits(((await kRes.json()) as { kits: Kit[] }).kits);
      if (custRes.ok) setCustomers(((await custRes.json()) as { customers: Customer[] }).customers);
      if (!ignore) setStatus("Каталог обновлен.");
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [startDate, endDate, search]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const activeCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );

  function addItem(item: ItemRow, qty = 1) {
    if (!canAddToCart(item)) {
      setStatus(`Позиция «${item.name}» недоступна для добавления.`);
      return;
    }
    setCart((prev) => {
      const index = prev.findIndex((entry) => entry.itemId === item.id);
      if (index >= 0) {
        const currentQty = prev[index].qty;
        const nextQty = Math.min(currentQty + qty, item.availableQty);
        if (nextQty === currentQty) {
          setStatus(`Для «${item.name}» достигнут максимум по доступному количеству.`);
          return prev;
        }
        const next = [...prev];
        next[index] = { ...next[index], qty: nextQty };
        return next;
      }
      return [...prev, { itemId: item.id, name: item.name, qty: Math.min(qty, item.availableQty) }];
    });
  }

  function addKit(kit: Kit) {
    let addedCount = 0;
    let skippedCount = 0;
    for (const line of kit.lines) {
      const item = itemById.get(line.item.id);
      if (!item || !canAddToCart(item)) {
        skippedCount += 1;
        continue;
      }
      addItem(item, line.defaultQty);
      addedCount += 1;
    }
    if (addedCount === 0) {
      setStatus(`Пакет «${kit.name}» не добавлен: все позиции недоступны.`);
      return;
    }
    setStatus(
      skippedCount > 0
        ? `Пакет «${kit.name}»: добавлено ${addedCount}, пропущено ${skippedCount} недоступных позиций.`
        : `Пакет «${kit.name}» добавлен в корзину.`,
    );
  }

  const isGreenwich = role === "GREENWICH";
  const rentalDays = useMemo(() => calcDays(startDate, endDate), [startDate, endDate]);
  const cartSubtotalPerDay = useMemo(
    () =>
      cart.reduce((sum, line) => {
        const item = itemById.get(line.itemId);
        if (!item) return sum;
        const price = isGreenwich ? item.pricePerDayDiscounted : item.pricePerDay;
        return sum + line.qty * price;
      }, 0),
    [cart, itemById, isGreenwich],
  );
  const cartTotal = cartSubtotalPerDay * rentalDays;

  async function submitOrder() {
    if (!isGreenwich) {
      setStatus("Этот раздел для заявок Greenwich. Для склада используйте «Быструю выдачу».");
      return;
    }
    if (cart.length === 0) {
      setStatus("Корзина пуста.");
      return;
    }
    if (!customerId && customerName.trim().length === 0) {
      setStatus("Укажите заказчика: выберите из базы или введите нового.");
      return;
    }

    for (const line of cart) {
      const item = itemById.get(line.itemId);
      if (!item || !canAddToCart(item) || line.qty > item.availableQty) {
        setStatus(`Позиция «${line.name}» сейчас недоступна. Обновите корзину.`);
        return;
      }
    }

    setStatus("Оформляем заявку...");
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate,
        endDate,
        readyByDate: isGreenwich ? readyByDate : startDate,
        customerId: customerId || undefined,
        customerName: customerName.trim() || undefined,
        eventName: eventName.trim() || null,
        notes: notes.trim() || null,
        orderSource: "GREENWICH_INTERNAL",
        issueImmediately: false,
        lines: cart.map((line) => ({ itemId: line.itemId, requestedQty: line.qty })),
        deliveryRequested,
        deliveryComment: deliveryComment.trim() || null,
        mountRequested,
        mountComment: mountComment.trim() || null,
        dismountRequested,
        dismountComment: dismountComment.trim() || null,
      }),
    });
    const payload = (await response.json()) as { order?: { id: string; status: string }; error?: { message?: string } };
    if (!response.ok || !payload.order) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось создать заявку."}`);
      return;
    }
    setCart([]);
    setStatus(`Заявка ${payload.order.id} оформлена. Переходим в «Мои заявки»...`);
    globalThis.setTimeout(() => {
      globalThis.location.href = "/my-orders";
    }, 700);
  }

  const visibleItems = useMemo(
    () =>
      (selectedCategoryId ? items.filter((item) => item.categories?.some((cat) => cat.id === selectedCategoryId)) : items).sort((a, b) => {
        const av = canAddToCart(a) ? 0 : 1;
        const bv = canAddToCart(b) ? 0 : 1;
        if (av !== bv) return av - bv;
        return a.name.localeCompare(b.name, "ru");
      }),
    [items, selectedCategoryId],
  );
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const pagedItems = useMemo(
    () => visibleItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [visibleItems, page],
  );

  useEffect(() => {
    setPage(1);
  }, [tab, selectedCategoryId, search, startDate, endDate]);

  function setItemQty(item: ItemRow, qty: number) {
    const boundedQty = Math.max(0, Math.min(item.availableQty, qty));
    setCart((prev) => {
      const index = prev.findIndex((entry) => entry.itemId === item.id);
      if (boundedQty <= 0) {
        if (index < 0) return prev;
        return prev.filter((entry) => entry.itemId !== item.id);
      }
      if (index < 0) {
        return [...prev, { itemId: item.id, name: item.name, qty: boundedQty }];
      }
      const next = [...prev];
      next[index] = { ...next[index], qty: boundedQty };
      return next;
    });
  }

  const isError = status.startsWith("Ошибка");
  const isValidation =
    status.length > 0 &&
    (status.includes("Укажите") ||
      status.includes("Корзина пуста") ||
      status.includes("недоступн") ||
      status.includes("максимум") ||
      status.includes("Этот раздел") ||
      status.includes("Обновите корзину"));

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--brand)]">Каталог и оформление заявки</h1>
      <div className="flex justify-end">
        <button className="ws-btn" type="button" onClick={() => { globalThis.location.href = "/"; }}>
          Назад
        </button>
      </div>
      {!isGreenwich ? (
        <div className="ws-card border p-3 text-sm">
          Для сотрудников склада/админа оформление внешних заказов выполняется в разделе `Быстрая выдача`.
        </div>
      ) : null}

      <div className="ws-card grid min-w-0 max-w-full grid-cols-1 gap-2 overflow-hidden p-3 sm:grid-cols-2 lg:grid-cols-4">
        {isGreenwich ? (
          <label className="min-w-0 max-w-full text-xs font-medium text-amber-800">
            Готовность к дате
            <input className="mt-1 w-full min-w-0 max-w-full rounded-xl border-2 border-amber-300 bg-amber-50 px-2 py-2 text-sm box-border" type="date" value={readyByDate} onChange={(e) => setReadyByDate(e.target.value)} max={startDate} />
          </label>
        ) : null}
        <label className="min-w-0 max-w-full text-xs text-[var(--muted)]">
          Начало аренды
          <input className="mt-1 w-full min-w-0 max-w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm box-border" type="date" value={startDate} onChange={(e) => {
            const v = e.target.value;
            setStartDate(v);
            if (readyByDate > v) setReadyByDate(v);
          }} />
        </label>
        <label className="min-w-0 max-w-full text-xs text-[var(--muted)]">
          Окончание аренды
          <input className="mt-1 w-full min-w-0 max-w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm box-border" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label className="min-w-0 max-w-full text-xs text-[var(--muted)]">
          Поиск
          <input className="mt-1 w-full min-w-0 max-w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm box-border" placeholder="Поиск по позициям" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {isGreenwich ? (
        <details className="ws-card p-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--brand)]">Что означают даты</summary>
          <div className="mt-2 space-y-2 text-xs text-[var(--muted)]">
            <p><strong className="text-amber-800">Готовность к дате</strong> — к какому числу нужно подготовить реквизит и когда его заберут или когда мы отправим. Может быть раньше или в день начала аренды.</p>
            <p><strong>Начало аренды</strong> — первый день периода аренды (с этого дня считается использование).</p>
            <p><strong>Окончание аренды</strong> — последний день периода аренды (до этой даты включительно).</p>
          </div>
        </details>
      ) : null}

      <details className="ws-card p-3">
        <summary className="cursor-pointer text-sm font-medium text-[var(--brand)]">Легенда статусов</summary>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> доступно к аренде</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-orange-500" /> занято на выбранные даты</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-amber-500" /> требуется ремонт</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-red-500" /> сломано</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-zinc-500" /> отсутствует</span>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <button
          className={tab === "all" ? "ws-btn-primary" : "ws-btn"}
          type="button"
          onClick={() => {
            setTab("all");
            setSelectedCategoryId("");
          }}
        >
          Все позиции
        </button>
        <button className={tab === "categories" ? "ws-btn-primary" : "ws-btn"} type="button" onClick={() => setTab("categories")}>
          Подборки
        </button>
        <button className={tab === "kits" ? "ws-btn-primary" : "ws-btn"} type="button" onClick={() => setTab("kits")}>
          Пакеты
        </button>
      </div>

      {activeCategory ? (
        <div className="ws-card flex items-center justify-between p-2 text-sm">
          <span>Фильтр подборки: <strong>{activeCategory.name}</strong></span>
          <button className="ws-btn" type="button" onClick={() => setSelectedCategoryId("")}>Показать все позиции</button>
        </div>
      ) : null}

      {tab === "categories" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <button key={category.id} className="ws-card p-4 text-left hover:bg-violet-50" type="button" onClick={() => { setSelectedCategoryId(category.id); setTab("all"); }}>
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
                    <div className="text-xs text-[var(--muted)]">
                      Цена пакета/сутки:{" "}
                      {formatMoney(
                        kit.lines.reduce((sum, line) => {
                          const unit = isGreenwich
                            ? line.item.pricePerDayDiscounted
                            : line.item.pricePerDay;
                          return sum + line.defaultQty * unit;
                        }, 0),
                      )}{" "}
                      ₽
                    </div>
                  <div className="mt-2 text-xs text-[var(--muted)]">
                    {kit.lines.slice(0, 4).map((line) => `${line.item.name} x${line.defaultQty}`).join(", ")}
                    {kit.lines.length > 4 ? ` +${kit.lines.length - 4}` : ""}
                  </div>
                </div>
                <button className="ws-btn" type="button" onClick={() => addKit(kit)}>
                  Добавить пакет
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "all" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {pagedItems.map((item) => {
            const visual = getVisualStatus(item);
            const isAddable = canAddToCart(item);
            const inCart = cart.find((entry) => entry.itemId === item.id);
            const qty = inCart?.qty ?? 0;
            return (
              <div key={item.id} className="ws-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="inline-flex items-center gap-2 font-medium">
                      <i className={`h-2.5 w-2.5 rounded-full ${visual.dot}`} />
                      {item.name}
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      {item.itemType} • {visual.label} • доступно: {item.availableQty}
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      Цена/сутки: {formatMoney(isGreenwich ? item.pricePerDayDiscounted : item.pricePerDay)} ₽
                    </div>
                  </div>
                  {qty > 0 ? (
                    <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-2 py-1">
                      <button className="ws-btn" type="button" onClick={() => setItemQty(item, qty - 1)}>
                        -
                      </button>
                      <span className="min-w-6 text-center text-sm font-medium">{qty}</span>
                      <button className="ws-btn" type="button" onClick={() => setItemQty(item, qty + 1)}>
                        +
                      </button>
                    </div>
                  ) : (
                    <button className="ws-btn disabled:opacity-50" type="button" onClick={() => addItem(item)} disabled={!isAddable}>
                      В корзину
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {tab === "all" && totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <button className="ws-btn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Назад
          </button>
          <span className="text-sm text-[var(--muted)]">
            Страница {page} из {totalPages}
          </span>
          <button className="ws-btn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Далее
          </button>
        </div>
      ) : null}

      <div className="ws-card space-y-4 p-4">
        {isGreenwich ? (
          <p className="rounded-xl bg-violet-50/80 p-2 text-center text-sm text-[var(--brand)]">
            Заполните шаги по порядку и нажмите внизу «Оформить заявку».
          </p>
        ) : null}
        <div className="rounded-xl bg-slate-50/90 p-3">
          <div className="mb-2 text-sm font-medium text-[var(--muted)]">1. Кто заказчик</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Выберите из списка</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <input className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" placeholder="Или введите имя нового" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <input className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm sm:col-span-2" placeholder="Мероприятие (не обязательно)" value={eventName} onChange={(e) => setEventName(e.target.value)} />
            <input className="rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm sm:col-span-2" placeholder="Комментарий (не обязательно)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--muted)]">2. Что в корзине</div>
              <div className="text-xs text-[var(--muted)]">Добавляйте кнопкой «В корзину» выше. Меняйте количество кнопками − и +</div>
            </div>
            {cart.length > 0 ? (
              <button
                className="ws-btn text-sm"
                type="button"
                onClick={() => {
                  if (confirm("Очистить корзину?")) setCart([]);
                }}
              >
                Очистить
              </button>
            ) : null}
          </div>
          {cart.length === 0 ? (
            <div className="py-4 text-center text-sm text-[var(--muted)]">Корзина пустая</div>
          ) : (
            <ul className="space-y-3">
              {cart.map((line) => {
                const item = itemById.get(line.itemId);
                const maxQty = item ? Math.max(1, item.availableQty) : 1;
                const editStr = cartQtyEdit[line.itemId];
                const displayQty = line.qty;
                const inputValue = editStr !== undefined ? editStr : String(displayQty);
                const commitQty = (raw: string) => {
                  const n = raw.trim() === "" ? 1 : parseInt(raw, 10);
                  const qty = Number.isFinite(n) ? Math.max(1, Math.min(maxQty, n)) : displayQty;
                  setCart((prev) => prev.map((entry) => entry.itemId === line.itemId ? { ...entry, qty } : entry));
                  setCartQtyEdit((prev) => {
                    const next = { ...prev };
                    delete next[line.itemId];
                    return next;
                  });
                };
                return (
                  <li key={line.itemId} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-slate-50/50 px-3 py-2">
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{line.name}</span>
                      {item ? (
                        <div className="text-xs text-[var(--muted)]">
                          {displayQty} × {formatMoney(isGreenwich ? item.pricePerDayDiscounted : item.pricePerDay)} ₽/сут = {formatMoney(displayQty * (isGreenwich ? item.pricePerDayDiscounted : item.pricePerDay))} ₽/сут
                        </div>
                      ) : null}
                    </div>
                    <div className="inline-flex items-center gap-1">
                      <button
                        className="ws-btn h-9 w-9 shrink-0 rounded-lg text-lg leading-none"
                        type="button"
                        onClick={() => {
                          const q = Math.max(1, displayQty - 1);
                          setCart((prev) => prev.map((entry) => entry.itemId === line.itemId ? { ...entry, qty: q } : entry));
                          setCartQtyEdit((prev) => {
                            const next = { ...prev };
                            delete next[line.itemId];
                            return next;
                          });
                        }}
                        aria-label="Уменьшить"
                      >
                        −
                      </button>
                      <input
                        className="w-12 rounded-lg border border-[var(--border)] bg-white px-1 py-1.5 text-center text-sm tabular-nums"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={inputValue}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "");
                          setCartQtyEdit((prev) => ({ ...prev, [line.itemId]: v }));
                        }}
                        onBlur={() => commitQty(inputValue)}
                        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), commitQty(inputValue))}
                        aria-label="Количество"
                      />
                      <button
                        className="ws-btn h-9 w-9 shrink-0 rounded-lg text-lg leading-none"
                        type="button"
                        onClick={() => {
                          const q = Math.min(maxQty, displayQty + 1);
                          setCart((prev) => prev.map((entry) => entry.itemId === line.itemId ? { ...entry, qty: q } : entry));
                          setCartQtyEdit((prev) => {
                            const next = { ...prev };
                            delete next[line.itemId];
                            return next;
                          });
                        }}
                        disabled={displayQty >= maxQty}
                        aria-label="Увеличить"
                      >
                        +
                      </button>
                    </div>
                    <button className="ws-btn text-sm" type="button" onClick={() => setCart((prev) => prev.filter((entry) => entry.itemId !== line.itemId))} title="Удалить из корзины">
                      Удалить
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl bg-violet-50/90 p-3">
          <div className="mb-2 text-sm font-medium text-[var(--muted)]">3. Доп. услуги (включите, если нужны)</div>
          <div className="space-y-3 rounded-lg border border-[var(--border)] bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm w-20">Доставка</span>
              <button
                type="button"
                role="switch"
                aria-checked={deliveryRequested}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:ring-offset-2 ${deliveryRequested ? "bg-[var(--brand)]" : "bg-gray-200"}`}
                onClick={() => setDeliveryRequested((v) => !v)}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${deliveryRequested ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              {deliveryRequested ? (
                <input className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm" placeholder="Куда, когда (комментарий)" value={deliveryComment} onChange={(e) => setDeliveryComment(e.target.value)} />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm w-20">Монтаж</span>
              <button
                type="button"
                role="switch"
                aria-checked={mountRequested}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:ring-offset-2 ${mountRequested ? "bg-[var(--brand)]" : "bg-gray-200"}`}
                onClick={() => setMountRequested((v) => !v)}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${mountRequested ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              {mountRequested ? (
                <input className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm" placeholder="Где, когда (комментарий)" value={mountComment} onChange={(e) => setMountComment(e.target.value)} />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm w-20">Демонтаж</span>
              <button
                type="button"
                role="switch"
                aria-checked={dismountRequested}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:ring-offset-2 ${dismountRequested ? "bg-[var(--brand)]" : "bg-gray-200"}`}
                onClick={() => setDismountRequested((v) => !v)}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${dismountRequested ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              {dismountRequested ? (
                <input className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-sm" placeholder="Где, когда (комментарий)" value={dismountComment} onChange={(e) => setDismountComment(e.target.value)} />
              ) : null}
            </div>
          </div>
        </div>

        {status ? (
          <div
            className={`rounded-xl border p-3 text-sm font-medium ${
              isError
                ? "border-red-300 bg-red-50 text-red-800"
                : isValidation
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-[var(--border)] bg-violet-50 text-[var(--brand)]"
            }`}
            role="alert"
          >
            {status}
          </div>
        ) : null}

        <div className="rounded-xl border border-[var(--border)] bg-violet-50/90 p-3">
          <div className="mb-1 text-xs font-medium text-[var(--muted)]">4. Итого к оплате</div>
          <div className="text-sm">
            <div>Суток: {rentalDays}</div>
            <div>Сумма: <strong className="text-[var(--brand)]">{formatMoney(cartTotal)} ₽</strong></div>
          </div>
        </div>

        <div className="flex justify-end">
          <button className="ws-btn-primary min-h-12 min-w-[200px] text-base disabled:opacity-50" type="button" onClick={() => void submitOrder()} disabled={cart.length === 0 || !isGreenwich}>
            Оформить заявку
          </button>
        </div>
      </div>
    </section>
  );
}
