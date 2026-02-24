"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
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

  useEffect(() => {
    void Promise.all([loadItems(""), loadCategories()]);
  }, []);

  async function loadItems(value: string) {
    const query = value.trim().length > 0 ? `?search=${encodeURIComponent(value.trim())}` : "";
    const response = await fetch(`/api/admin/catalog/items${query}`);
    const payload = (await response.json()) as { items?: Item[]; error?: { message?: string } };
    if (!response.ok || !payload.items) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить позиции."}`);
      return;
    }
    setItems(payload.items);
    setStatus(`Позиции: ${payload.items.length}`);
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
    await loadItems(search);
    setStatus("Позиция обновлена.");
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
    await loadItems(search);
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
        <h1 className="text-xl font-semibold">Позиции и фото</h1>
        <Link href="/warehouse/inventory" className="text-sm text-zinc-600 hover:text-zinc-900">
          Назад в инвентарь
        </Link>
      </div>
      <p className="text-sm text-zinc-700">{status}</p>

      <div className="flex items-center gap-2">
        <input className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Поиск по названию/ID" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100" type="button" onClick={() => void loadItems(search)}>
          Найти
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <div className="max-h-72 overflow-auto rounded border border-zinc-200 bg-white">
          {items.map((item) => (
            <button
              key={item.id}
              className={`block w-full border-b border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                selectedItemId === item.id ? "bg-zinc-100" : ""
              }`}
              onClick={() => selectItem(item.id)}
              type="button"
            >
              <div className="font-medium">{item.name}</div>
              <div className="text-xs text-zinc-500">{item.id}</div>
            </button>
          ))}
        </div>

        {draft ? (
          <div className="space-y-2 rounded border border-zinc-200 bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="rounded border border-zinc-300 px-2 py-1 text-sm" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              <select className="rounded border border-zinc-300 px-2 py-1 text-sm" value={draft.itemType} onChange={(event) => setDraft({ ...draft, itemType: event.target.value as "ASSET" | "BULK" | "CONSUMABLE" })}>
                <option value="ASSET">ASSET</option>
                <option value="BULK">BULK</option>
                <option value="CONSUMABLE">CONSUMABLE</option>
              </select>
              <select
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
                value={draft.availabilityStatus}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    availabilityStatus: event.target.value as "ACTIVE" | "NEEDS_REPAIR" | "BROKEN" | "MISSING" | "RETIRED",
                  })
                }
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="NEEDS_REPAIR">NEEDS_REPAIR</option>
                <option value="BROKEN">BROKEN</option>
                <option value="MISSING">MISSING</option>
                <option value="RETIRED">RETIRED</option>
              </select>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">Stock</span>
                <input className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" type="number" min={0} value={draft.stockTotal} onChange={(event) => setDraft({ ...draft, stockTotal: Number(event.target.value) })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">На ремонте</span>
                <input className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" type="number" min={0} value={draft.stockInRepair} onChange={(event) => setDraft({ ...draft, stockInRepair: Number(event.target.value) })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">Сломано</span>
                <input className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" type="number" min={0} value={draft.stockBroken} onChange={(event) => setDraft({ ...draft, stockBroken: Number(event.target.value) })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">Утеряно</span>
                <input className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" type="number" min={0} value={draft.stockMissing} onChange={(event) => setDraft({ ...draft, stockMissing: Number(event.target.value) })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">Price/day</span>
                <input className="w-full rounded border border-zinc-300 px-2 py-1 text-sm" type="number" min={0} step="0.01" value={draft.pricePerDay} onChange={(event) => setDraft({ ...draft, pricePerDay: Number(event.target.value) })} />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-xs text-zinc-600">Категории</span>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <label key={category.id} className="inline-flex items-center gap-1 text-xs">
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
                    {category.name}
                  </label>
                ))}
              </div>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs text-zinc-600">Фото позиции (URL по строкам)</span>
              <textarea
                className="h-24 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                value={draft.imageUrlsText}
                onChange={(event) => setDraft({ ...draft, imageUrlsText: event.target.value })}
              />
            </label>

            <button
              className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
              type="button"
              onClick={() => void saveItem()}
              disabled={busy}
            >
              {busy ? "..." : "Сохранить позицию"}
            </button>
            <button
              className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              type="button"
              onClick={() => void deleteItem()}
              disabled={busy}
            >
              {busy ? "..." : "Удалить позицию"}
            </button>
          </div>
        ) : (
          <div className="rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
            Выбери позицию слева.
          </div>
        )}
      </div>
    </section>
  );
}
