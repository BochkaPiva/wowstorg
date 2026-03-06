"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Category = {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
  items?: Array<{ id: string; name: string }>;
};

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState("Загрузка...");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { name: string; description: string }>>({});

  useEffect(() => {
    void loadCategories();
  }, []);

  async function loadCategories() {
    const response = await fetch("/api/admin/catalog/categories");
    const payload = (await response.json()) as {
      categories?: Category[];
      error?: { message?: string };
    };
    if (!response.ok || !payload.categories) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить категории."}`);
      return;
    }
    setCategories(payload.categories);
    setDrafts(
      payload.categories.reduce<Record<string, { name: string; description: string }>>((acc, category) => {
        acc[category.id] = {
          name: category.name,
          description: category.description ?? "",
        };
        return acc;
      }, {}),
    );
    setStatus(`Категорий: ${payload.categories.length}`);
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    setBusyId("create");
    const response = await fetch("/api/admin/catalog/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDescription.trim() || null,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось сохранить категорию."}`);
      setBusyId(null);
      return;
    }
    setNewName("");
    setNewDescription("");
    await loadCategories();
    setStatus("Категория сохранена.");
    setBusyId(null);
  }

  async function saveCategory(categoryId: string) {
    const draft = drafts[categoryId];
    if (!draft) {
      return;
    }
    setBusyId(categoryId);
    const response = await fetch(`/api/admin/catalog/categories/${categoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        description: draft.description.trim() || null,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось обновить категорию."}`);
      setBusyId(null);
      return;
    }
    await loadCategories();
    setStatus("Категория обновлена.");
    setBusyId(null);
  }

  async function deleteCategory(categoryId: string) {
    const confirmed = globalThis.confirm("Удалить категорию подборки?");
    if (!confirmed) {
      return;
    }
    setBusyId(`delete-${categoryId}`);
    const response = await fetch(`/api/admin/catalog/categories/${categoryId}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось удалить категорию."}`);
      setBusyId(null);
      return;
    }
    await loadCategories();
    setStatus("Категория удалена.");
    setBusyId(null);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--brand)]">Подборки (категории)</h1>
        <Link href="/warehouse/inventory" className="ws-btn">
          Назад
        </Link>
      </div>
      <p className="text-sm text-[var(--muted)]">{status}</p>

      <form className="ws-card grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={createCategory}>
        <label>
          <span className="mb-1 block text-xs text-[var(--muted)]">Название категории</span>
          <input
            className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-[var(--muted)]">Описание (необязательно)</span>
          <input
            className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
            value={newDescription}
            onChange={(event) => setNewDescription(event.target.value)}
          />
        </label>
        <button className="ws-btn-primary self-end disabled:opacity-50" type="submit" disabled={busyId !== null}>
          {busyId === "create" ? "..." : "Добавить категорию"}
        </button>
      </form>

      <div className="space-y-3">
        {categories.map((category) => {
          const draft = drafts[category.id];
          return (
            <div key={category.id} className="ws-card space-y-3 p-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                <label>
                  <span className="mb-1 block text-xs text-[var(--muted)]">Название</span>
                  <input
                    className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
                    value={draft?.name ?? category.name}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [category.id]: {
                          name: event.target.value,
                          description: prev[category.id]?.description ?? category.description ?? "",
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs text-[var(--muted)]">Описание</span>
                  <input
                    className="w-full rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm"
                    value={draft?.description ?? category.description ?? ""}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [category.id]: {
                          name: prev[category.id]?.name ?? category.name,
                          description: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <button
                  className="ws-btn disabled:opacity-50"
                  type="button"
                  onClick={() => void saveCategory(category.id)}
                  disabled={busyId !== null}
                >
                  {busyId === category.id ? "..." : "Сохранить"}
                </button>
                <button
                  className="ws-btn border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                  type="button"
                  onClick={() => void deleteCategory(category.id)}
                  disabled={busyId !== null}
                >
                  {busyId === `delete-${category.id}` ? "..." : "Удалить"}
                </button>
              </div>
              <div className="text-xs text-[var(--muted)]">Позиций в подборке: {category.itemCount}</div>
              {category.items != null && category.items.length > 0 ? (
                <div className="text-xs text-[var(--muted)]">
                  Состав: {category.items.slice(0, 6).map((item) => item.name).join(", ")}
                  {category.items.length > 6 ? ` +${category.items.length - 6}` : ""}
                </div>
              ) : (
                <div className="text-xs text-[var(--muted)]">Состав пока пуст</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
