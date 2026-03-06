"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
  description: string | null;
  locationText: string | null;
  itemType: "ASSET" | "BULK" | "CONSUMABLE";
  availabilityStatus: "ACTIVE" | "NEEDS_REPAIR" | "BROKEN" | "MISSING" | "RETIRED";
  stockTotal: number;
  stockInRepair: number;
  stockBroken: number;
  stockMissing: number;
  pricePerDay: number;
  categoryIds: string[];
  imageUrls: string[];
};

const ITEM_TYPE_OPTIONS = [
  { value: "ASSET", label: "Штучный реквизит" },
  { value: "BULK", label: "Массовая позиция" },
  { value: "CONSUMABLE", label: "Расходник" },
] as const;

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Активно" },
  { value: "NEEDS_REPAIR", label: "Требуется ремонт" },
  { value: "BROKEN", label: "Сломано" },
  { value: "MISSING", label: "Утеряно" },
  { value: "RETIRED", label: "Списано" },
] as const;

type Category = {
  id: string;
  name: string;
};

export default function AdminItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState("Загрузка...");
  const [search, setSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{
    name: string;
    description: string;
    locationText: string;
    itemType: "ASSET" | "BULK" | "CONSUMABLE";
    availabilityStatus: "ACTIVE" | "NEEDS_REPAIR" | "BROKEN" | "MISSING" | "RETIRED";
    stockTotal: number;
    stockInRepair: number;
    stockBroken: number;
    stockMissing: number;
    pricePerDay: number;
    categoryIds: string[];
    imageUrlsText: string;
  } | null>(null);
  const [newItem, setNewItem] = useState({
    name: "",
    description: "",
    locationText: "",
    itemType: "ASSET" as "ASSET" | "BULK" | "CONSUMABLE",
    availabilityStatus: "ACTIVE" as "ACTIVE" | "NEEDS_REPAIR" | "BROKEN" | "MISSING" | "RETIRED",
    stockTotal: 1,
    stockInRepair: 0,
    stockBroken: 0,
    stockMissing: 0,
    pricePerDay: 100,
    categoryIds: [] as string[],
    imageUrlsText: "",
  });
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;

  useEffect(() => {
    void Promise.all([loadItems(search, 1), loadCategories()]);
  }, []);

  async function loadItems(value: string, pageNum: number = 1) {
    const params = new URLSearchParams();
    if (value.trim()) params.set("search", value.trim());
    params.set("page", String(pageNum));
    params.set("limit", String(limit));
    const response = await fetch(`/api/admin/catalog/items?${params.toString()}`);
    const payload = (await response.json()) as {
      items?: Item[];
      total?: number;
      page?: number;
      error?: { message?: string };
    };
    if (!response.ok || !payload.items) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить позиции."}`);
      return;
    }
    setItems(payload.items);
    setTotalItems(payload.total ?? payload.items.length);
    setPage(payload.page ?? pageNum);
    const total = payload.total ?? payload.items.length;
    setStatus(`Позиции: ${payload.items.length} из ${total}${total > limit ? ` (страница ${payload.page ?? pageNum})` : ""}`);
  }

  async function loadCategories() {
    const response = await fetch("/api/admin/catalog/categories");
    const payload = (await response.json()) as {
      categories?: Category[];
      error?: { message?: string };
    };
    if (!response.ok || !payload.categories) {
      setStatus(`Ошибка категорий: ${payload.error?.message ?? "Не удалось загрузить категории."}`);
      return;
    }
    setCategories(payload.categories.map((category) => ({ id: category.id, name: category.name })));
  }

  function selectItem(itemId: string) {
    setSelectedItemId(itemId);
    const item = items.find((entry) => entry.id === itemId);
    if (!item) {
      setDraft(null);
      return;
    }
    setDraft({
      name: item.name,
      description: item.description ?? "",
      locationText: item.locationText ?? "",
      itemType: item.itemType,
      availabilityStatus: item.availabilityStatus,
      stockTotal: item.stockTotal,
      stockInRepair: item.stockInRepair,
      stockBroken: item.stockBroken,
      stockMissing: item.stockMissing,
      pricePerDay: item.pricePerDay,
      categoryIds: item.categoryIds,
      imageUrlsText: item.imageUrls.join("\n"),
    });
  }

  async function saveItem() {
    if (!selectedItemId || !draft) {
      return;
    }
    setBusy(true);
    const response = await fetch("/api/admin/catalog/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: selectedItemId,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        locationText: draft.locationText.trim() || null,
        itemType: draft.itemType,
        availabilityStatus: draft.availabilityStatus,
        stockTotal: draft.stockTotal,
        stockInRepair: draft.stockInRepair,
        stockBroken: draft.stockBroken,
        stockMissing: draft.stockMissing,
        pricePerDay: draft.pricePerDay,
        categoryIds: draft.categoryIds,
        imageUrls: draft.imageUrlsText
          .split("\n")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось сохранить позицию."}`);
      setBusy(false);
      return;
    }
    await loadItems(search, page);
    setStatus("Позиция обновлена.");
    setBusy(false);
  }

  async function createItem() {
    if (!newItem.name.trim()) {
      setStatus("Укажите название новой позиции.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/admin/catalog/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newItem.name.trim(),
        description: newItem.description.trim() || null,
        locationText: newItem.locationText.trim() || null,
        itemType: newItem.itemType,
        availabilityStatus: newItem.availabilityStatus,
        stockTotal: newItem.stockTotal,
        stockInRepair: newItem.stockInRepair,
        stockBroken: newItem.stockBroken,
        stockMissing: newItem.stockMissing,
        pricePerDay: newItem.pricePerDay,
        categoryIds: newItem.categoryIds,
        imageUrls: newItem.imageUrlsText
          .split("\n")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string }; item?: { id: string } };
    if (!response.ok || !payload.item) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось создать позицию."}`);
      setBusy(false);
      return;
    }
    await loadItems(search, 1);
    setSelectedItemId(payload.item.id);
    selectItem(payload.item.id);
    setStatus("Позиция создана.");
    setBusy(false);
  }

  async function deleteItem() {
    if (!selectedItemId) {
      return;
    }
    const confirmed = globalThis.confirm("Удалить позицию? Если есть история, позиция будет переведена в RETIRED.");
    if (!confirmed) {
      return;
    }
    setBusy(true);
    const response = await fetch("/api/admin/catalog/items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: selectedItemId }),
    });
    const payload = (await response.json()) as { error?: { message?: string }; message?: string; mode?: string };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось удалить позицию."}`);
      setBusy(false);
      return;
    }
    setSelectedItemId("");
    setDraft(null);
    await loadItems(search, page);
    if (payload.mode === "retired") {
      setStatus(payload.message ?? "Позиция переведена в RETIRED.");
    } else {
      setStatus("Позиция удалена.");
    }
    setBusy(false);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Позиции и фото</h1>
        <Link href="/warehouse/inventory" className="ws-btn">
          Назад
        </Link>
      </div>
      <p className="text-sm text-[var(--muted)]">{status}</p>

      <div className="ws-card flex flex-wrap items-center gap-2 p-3">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs text-[var(--muted)]">Поиск по названию или ID</span>
          <input
            className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
            placeholder="Введите название или ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button className="ws-btn self-end" type="button" onClick={() => void loadItems(search, 1)}>
          Найти
        </button>
      </div>

      {totalItems > limit ? (
        <div className="ws-card flex flex-wrap items-center gap-2 p-2">
          <span className="text-sm text-[var(--muted)]">Страница {page} из {Math.ceil(totalItems / limit)}</span>
          <button className="ws-btn text-sm disabled:opacity-50" type="button" onClick={() => void loadItems(search, page - 1)} disabled={page <= 1}>
            Назад
          </button>
          <button className="ws-btn text-sm disabled:opacity-50" type="button" onClick={() => void loadItems(search, page + 1)} disabled={page >= Math.ceil(totalItems / limit)}>
            Вперёд
          </button>
        </div>
      ) : null}

      <div className="ws-card space-y-4 p-4">
        <h2 className="text-sm font-medium text-[var(--foreground)]">Добавить новую позицию</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-[var(--muted)]">Название позиции</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
              value={newItem.name}
              onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-[var(--muted)]">Место хранения (необязательно)</span>
            <input
              className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
              value={newItem.locationText}
              onChange={(event) => setNewItem((prev) => ({ ...prev, locationText: event.target.value }))}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-[var(--muted)]">Описание для каталога (необязательно)</span>
            <textarea
              className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
              value={newItem.description}
              onChange={(event) => setNewItem((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-[var(--muted)]">Тип позиции</span>
            <select className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={newItem.itemType} onChange={(event) => setNewItem((prev) => ({ ...prev, itemType: event.target.value as "ASSET" | "BULK" | "CONSUMABLE" }))}>
              {ITEM_TYPE_OPTIONS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-[var(--muted)]">Кол-во на складе</span>
            <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" type="number" min={0} value={newItem.stockTotal} onChange={(event) => setNewItem((prev) => ({ ...prev, stockTotal: Number(event.target.value) }))} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-[var(--muted)]">Цена за сутки, ₽</span>
            <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" type="number" min={0} step="0.01" value={newItem.pricePerDay} onChange={(event) => setNewItem((prev) => ({ ...prev, pricePerDay: Number(event.target.value) }))} />
          </label>
        </div>
        <button className="ws-btn-primary disabled:opacity-50" type="button" onClick={() => void createItem()} disabled={busy}>
          {busy ? "..." : "Создать позицию"}
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <div className="ws-card max-h-80 overflow-auto p-0">
          {items.map((item) => (
            <button
              key={item.id}
              className={`block w-full border-b border-[var(--border)] px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-violet-50 ${
                selectedItemId === item.id ? "bg-violet-50 font-medium" : ""
              }`}
              onClick={() => selectItem(item.id)}
              type="button"
            >
              <div>{item.name}</div>
              <div className="text-xs text-[var(--muted)]">{item.id}</div>
            </button>
          ))}
        </div>

        {draft ? (
          <div className="ws-card space-y-4 p-4">
            <h2 className="text-sm font-medium text-[var(--foreground)]">Редактировать позицию</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs text-[var(--muted)]">Название</span>
                <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs text-[var(--muted)]">Место хранения</span>
                <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={draft.locationText} onChange={(event) => setDraft({ ...draft, locationText: event.target.value })} />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs text-[var(--muted)]">Описание для каталога</span>
                <textarea className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-[var(--muted)]">Тип позиции</span>
                <select className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" value={draft.itemType} onChange={(event) => setDraft({ ...draft, itemType: event.target.value as "ASSET" | "BULK" | "CONSUMABLE" })}>
                  {ITEM_TYPE_OPTIONS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs text-[var(--muted)]">Статус доступности</span>
                <select
                  className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
                  value={draft.availabilityStatus}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      availabilityStatus: event.target.value as "ACTIVE" | "NEEDS_REPAIR" | "BROKEN" | "MISSING" | "RETIRED",
                    })
                  }
                >
                  {STATUS_OPTIONS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs text-[var(--muted)]">Количество всего</span>
                <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" type="number" min={0} value={draft.stockTotal} onChange={(event) => setDraft({ ...draft, stockTotal: Number(event.target.value) })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-[var(--muted)]">На ремонте, шт</span>
                <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" type="number" min={0} value={draft.stockInRepair} onChange={(event) => setDraft({ ...draft, stockInRepair: Number(event.target.value) })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-[var(--muted)]">Сломано, шт</span>
                <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" type="number" min={0} value={draft.stockBroken} onChange={(event) => setDraft({ ...draft, stockBroken: Number(event.target.value) })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-[var(--muted)]">Утеряно, шт</span>
                <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" type="number" min={0} value={draft.stockMissing} onChange={(event) => setDraft({ ...draft, stockMissing: Number(event.target.value) })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-[var(--muted)]">Цена за сутки, ₽</span>
                <input className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm" type="number" min={0} step="0.01" value={draft.pricePerDay} onChange={(event) => setDraft({ ...draft, pricePerDay: Number(event.target.value) })} />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-[var(--muted)]">Подборки (категории)</span>
              <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--border)] bg-white p-2">
                {categories.map((category) => (
                  <label key={category.id} className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-violet-50">
                    <input
                      type="checkbox"
                      checked={draft.categoryIds.includes(category.id)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          categoryIds: event.target.checked
                            ? [...draft.categoryIds, category.id]
                            : draft.categoryIds.filter((entry) => entry !== category.id),
                        })
                      }
                    />
                    <span className="text-sm">{category.name}</span>
                  </label>
                ))}
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-[var(--muted)]">Фото позиции (URL, по одному на строку)</span>
              <textarea
                className="h-24 w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
                value={draft.imageUrlsText}
                onChange={(event) => setDraft({ ...draft, imageUrlsText: event.target.value })}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button className="ws-btn-primary disabled:opacity-50" type="button" onClick={() => void saveItem()} disabled={busy}>
                {busy ? "..." : "Сохранить позицию"}
              </button>
              <button
                className="ws-btn border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                type="button"
                onClick={() => void deleteItem()}
                disabled={busy}
              >
                {busy ? "..." : "Удалить позицию"}
              </button>
            </div>
          </div>
        ) : (
          <div className="ws-card flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] p-8 text-sm text-[var(--muted)]">
            Выберите позицию в списке слева
          </div>
        )}
      </div>
    </section>
  );
}
