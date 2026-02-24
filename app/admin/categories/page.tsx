"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Category = {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
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

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Категории подборок</h1>
        <Link href="/admin" className="text-sm text-zinc-600 hover:text-zinc-900">
          Назад в админку
        </Link>
      </div>
      <p className="text-sm text-zinc-700">{status}</p>

      <form className="grid gap-2 rounded border border-zinc-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={createCategory}>
        <input className="rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Название категории" value={newName} onChange={(event) => setNewName(event.target.value)} />
        <input className="rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Описание" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} />
        <button className="rounded bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700 disabled:opacity-50" type="submit" disabled={busyId !== null}>
          {busyId === "create" ? "..." : "Сохранить"}
        </button>
      </form>

      <div className="space-y-2">
        {categories.map((category) => {
          const draft = drafts[category.id];
          return (
            <div key={category.id} className="rounded border border-zinc-200 bg-white p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  className="rounded border border-zinc-300 px-2 py-1 text-sm"
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
                <input
                  className="rounded border border-zinc-300 px-2 py-1 text-sm"
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
                <button
                  className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50"
                  type="button"
                  onClick={() => void saveCategory(category.id)}
                  disabled={busyId !== null}
                >
                  {busyId === category.id ? "..." : "Обновить"}
                </button>
              </div>
              <div className="mt-1 text-xs text-zinc-500">Позиций в категории: {category.itemCount}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
