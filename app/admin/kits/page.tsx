"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Kit = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  isActive: boolean;
  lines: Array<{
    id: string;
    itemId: string;
    defaultQty: number;
  }>;
};

type Item = {
  id: string;
  name: string;
};

export default function AdminKitsPage() {
  const [kits, setKits] = useState<Kit[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("Загрузка...");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCoverImageUrl, setNewCoverImageUrl] = useState("");
  const [newLines, setNewLines] = useState<Array<{ itemId: string; defaultQty: number }>>([
    { itemId: "", defaultQty: 1 },
  ]);

  const [selectedKitId, setSelectedKitId] = useState("");
  const [draft, setDraft] = useState<{
    name: string;
    description: string;
    coverImageUrl: string;
    isActive: boolean;
    lines: Array<{ itemId: string; defaultQty: number }>;
  } | null>(null);

  useEffect(() => {
    void Promise.all([loadKits(), loadItems()]);
  }, []);

  async function loadKits() {
    const response = await fetch("/api/admin/catalog/kits");
    const payload = (await response.json()) as { kits?: Kit[]; error?: { message?: string } };
    if (!response.ok || !payload.kits) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить пакеты."}`);
      return;
    }
    setKits(payload.kits);
    setStatus(`Пакетов: ${payload.kits.length}`);
  }

  async function loadItems() {
    const response = await fetch("/api/admin/catalog/items");
    const payload = (await response.json()) as { items?: Item[]; error?: { message?: string } };
    if (!response.ok || !payload.items) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось загрузить позиции."}`);
      return;
    }
    setItems(payload.items.map((item) => ({ id: item.id, name: item.name })));
  }

  function addNewLine() {
    setNewLines((prev) => [...prev, { itemId: "", defaultQty: 1 }]);
  }

  function updateNewLine(index: number, patch: Partial<{ itemId: string; defaultQty: number }>) {
    setNewLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function createKit(event: FormEvent) {
    event.preventDefault();
    setBusyId("create");
    const lines = newLines
      .filter((line) => line.itemId && line.defaultQty > 0)
      .map((line) => ({ itemId: line.itemId, defaultQty: line.defaultQty }));
    const response = await fetch("/api/admin/catalog/kits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDescription.trim() || null,
        coverImageUrl: newCoverImageUrl.trim() || null,
        lines,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось создать пакет."}`);
      setBusyId(null);
      return;
    }
    setNewName("");
    setNewDescription("");
    setNewCoverImageUrl("");
    setNewLines([{ itemId: "", defaultQty: 1 }]);
    await loadKits();
    setStatus("Пакет создан.");
    setBusyId(null);
  }

  function selectKit(kitId: string) {
    setSelectedKitId(kitId);
    const kit = kits.find((entry) => entry.id === kitId);
    if (!kit) {
      setDraft(null);
      return;
    }
    setDraft({
      name: kit.name,
      description: kit.description ?? "",
      coverImageUrl: kit.coverImageUrl ?? "",
      isActive: kit.isActive,
      lines: kit.lines.map((line) => ({
        itemId: line.itemId,
        defaultQty: line.defaultQty,
      })),
    });
  }

  function updateDraftLine(index: number, patch: Partial<{ itemId: string; defaultQty: number }>) {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
      };
    });
  }

  async function saveKit() {
    if (!selectedKitId || !draft) {
      return;
    }
    setBusyId(selectedKitId);
    const lines = draft.lines
      .filter((line) => line.itemId && line.defaultQty > 0)
      .map((line) => ({ itemId: line.itemId, defaultQty: line.defaultQty }));
    const response = await fetch(`/api/admin/catalog/kits/${selectedKitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        coverImageUrl: draft.coverImageUrl.trim() || null,
        isActive: draft.isActive,
        lines,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось обновить пакет."}`);
      setBusyId(null);
      return;
    }
    await loadKits();
    setStatus("Пакет обновлен.");
    setBusyId(null);
  }

  async function deleteKit(kitId: string) {
    const confirmed = globalThis.confirm("Удалить пакет? Он исчезнет из выбора при создании заявки.");
    if (!confirmed) {
      return;
    }
    setBusyId(`delete-${kitId}`);
    const response = await fetch(`/api/admin/catalog/kits/${kitId}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось удалить пакет."}`);
      setBusyId(null);
      return;
    }
    if (selectedKitId === kitId) {
      setSelectedKitId("");
      setDraft(null);
    }
    await loadKits();
    setStatus("Пакет удален.");
    setBusyId(null);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Пакеты</h1>
        <Link href="/admin" className="text-sm text-zinc-600 hover:text-zinc-900">
          Назад в админку
        </Link>
      </div>
      <p className="text-sm text-zinc-700">{status}</p>

      <form className="space-y-2 rounded border border-zinc-200 bg-white p-3" onSubmit={createKit}>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Название пакета" value={newName} onChange={(event) => setNewName(event.target.value)} />
          <input className="rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="Описание" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} />
          <input className="rounded border border-zinc-300 px-2 py-1 text-sm" placeholder="URL обложки (опционально)" value={newCoverImageUrl} onChange={(event) => setNewCoverImageUrl(event.target.value)} />
        </div>
        <div className="space-y-1">
          {newLines.map((line, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_130px]">
              <select className="rounded border border-zinc-300 px-2 py-1 text-sm" value={line.itemId} onChange={(event) => updateNewLine(index, { itemId: event.target.value })}>
                <option value="">-- позиция --</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input className="rounded border border-zinc-300 px-2 py-1 text-sm" type="number" min={1} value={line.defaultQty} onChange={(event) => updateNewLine(index, { defaultQty: Number(event.target.value) })} />
            </div>
          ))}
          <button type="button" className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100" onClick={addNewLine}>
            + Позиция в пакет
          </button>
        </div>
        <button className="rounded bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700 disabled:opacity-50" type="submit" disabled={busyId !== null}>
          {busyId === "create" ? "..." : "Создать пакет"}
        </button>
      </form>

      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <div className="max-h-72 overflow-auto rounded border border-zinc-200 bg-white">
          {kits.map((kit) => (
            <button
              key={kit.id}
              className={`block w-full border-b border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                selectedKitId === kit.id ? "bg-zinc-100" : ""
              }`}
              onClick={() => selectKit(kit.id)}
              type="button"
            >
              <div className="font-medium">{kit.name}</div>
              <div className="text-xs text-zinc-500">{kit.id}</div>
            </button>
          ))}
        </div>

        {draft ? (
          <div className="space-y-2 rounded border border-zinc-200 bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="rounded border border-zinc-300 px-2 py-1 text-sm" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
                Активен
              </label>
              <input className="rounded border border-zinc-300 px-2 py-1 text-sm" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Описание" />
              <input className="rounded border border-zinc-300 px-2 py-1 text-sm" value={draft.coverImageUrl} onChange={(event) => setDraft({ ...draft, coverImageUrl: event.target.value })} placeholder="URL обложки" />
            </div>

            <div className="space-y-1">
              {draft.lines.map((line, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_130px]">
                  <select className="rounded border border-zinc-300 px-2 py-1 text-sm" value={line.itemId} onChange={(event) => updateDraftLine(index, { itemId: event.target.value })}>
                    <option value="">-- позиция --</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <input className="rounded border border-zinc-300 px-2 py-1 text-sm" type="number" min={1} value={line.defaultQty} onChange={(event) => updateDraftLine(index, { defaultQty: Number(event.target.value) })} />
                </div>
              ))}
            </div>

            <button
              className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
              type="button"
              onClick={() => void saveKit()}
              disabled={busyId !== null}
            >
              {busyId === selectedKitId ? "..." : "Сохранить пакет"}
            </button>
            <button
              className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              type="button"
              onClick={() => void deleteKit(selectedKitId)}
              disabled={busyId !== null}
            >
              {busyId === `delete-${selectedKitId}` ? "..." : "Удалить пакет"}
            </button>
          </div>
        ) : (
          <div className="rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
            Выбери пакет слева.
          </div>
        )}
      </div>
    </section>
  );
}
