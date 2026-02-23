"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "GREENWICH" | "WAREHOUSE" | "ADMIN";

type User = {
  id: string;
  telegramId: string;
  username: string | null;
  role: Role;
  createdAt: string;
  updatedAt: string;
};

type Customer = {
  id: string;
  name: string;
  contact: string | null;
  notes: string | null;
  isActive: boolean;
};

type Category = {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
};

type Item = {
  id: string;
  name: string;
  itemType: "ASSET" | "BULK" | "CONSUMABLE";
  stockTotal: number;
  pricePerDay: number;
  categoryIds: string[];
  imageUrls: string[];
};

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

type AuthMePayload = {
  user?: {
    id: string;
    role: Role;
    username: string | null;
  };
};

const ROLES: Role[] = ["GREENWICH", "WAREHOUSE", "ADMIN"];

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [status, setStatus] = useState("Проверяем доступ...");

  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [newTelegramId, setNewTelegramId] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState<Role>("GREENWICH");
  const [userDrafts, setUserDrafts] = useState<Record<string, { username: string; role: Role }>>({});

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");
  const [newCustomerNotes, setNewCustomerNotes] = useState("");
  const [customerDrafts, setCustomerDrafts] = useState<
    Record<string, { name: string; contact: string; notes: string; isActive: boolean }>
  >({});

  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, { name: string; description: string }>>({});

  const [items, setItems] = useState<Item[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [itemDraft, setItemDraft] = useState<{
    name: string;
    stockTotal: number;
    pricePerDay: number;
    itemType: "ASSET" | "BULK" | "CONSUMABLE";
    categoryIds: string[];
    imageUrlsText: string;
  } | null>(null);

  const [kits, setKits] = useState<Kit[]>([]);
  const [newKitName, setNewKitName] = useState("");
  const [newKitDescription, setNewKitDescription] = useState("");
  const [newKitCoverImageUrl, setNewKitCoverImageUrl] = useState("");
  const [newKitLines, setNewKitLines] = useState<Array<{ itemId: string; defaultQty: number }>>([
    { itemId: "", defaultQty: 1 },
  ]);
  const [selectedKitId, setSelectedKitId] = useState("");
  const [kitDraft, setKitDraft] = useState<{
    name: string;
    description: string;
    coverImageUrl: string;
    isActive: boolean;
    lines: Array<{ itemId: string; defaultQty: number }>;
  } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const usersCountText = useMemo(() => `Пользователей: ${users.length}`, [users.length]);
  const customersCountText = useMemo(() => `Заказчиков: ${customers.length}`, [customers.length]);

  useEffect(() => {
    let ignore = false;

    async function bootstrap() {
      const meResponse = await fetch("/api/auth/me");
      if (!meResponse.ok) {
        if (!ignore) {
          setStatus("Нужна авторизация.");
        }
        return;
      }

      const mePayload = (await meResponse.json()) as AuthMePayload;
      if (!mePayload.user || mePayload.user.role !== "ADMIN") {
        if (!ignore) {
          setStatus("Доступ запрещен: только ADMIN.");
        }
        return;
      }

      if (!ignore) {
        setAuthorized(true);
        setStatus("Загрузка данных...");
      }

      await Promise.all([loadUsers(""), loadCustomers("", false)]);
      await Promise.all([loadCategories(), loadItems(""), loadKits()]);
    }

    void bootstrap();
    return () => {
      ignore = true;
    };
  }, []);

  async function loadUsers(search: string) {
    const query = search.trim().length > 0 ? `?search=${encodeURIComponent(search.trim())}` : "";
    const response = await fetch(`/api/admin/users${query}`);
    const payload = (await response.json()) as {
      users?: User[];
      error?: { message?: string };
    };

    if (!response.ok || !payload.users) {
      setStatus(`Ошибка users: ${payload.error?.message ?? "Не удалось загрузить пользователей."}`);
      return;
    }

    setUsers(payload.users);
    setUserDrafts(
      payload.users.reduce<Record<string, { username: string; role: Role }>>((acc, user) => {
        acc[user.id] = { username: user.username ?? "", role: user.role };
        return acc;
      }, {}),
    );
    setStatus(`Готово. ${payload.users.length} пользователей.`);
  }

  async function loadCustomers(search: string, withInactive: boolean) {
    const params = new URLSearchParams();
    if (search.trim().length > 0) {
      params.set("search", search.trim());
    }
    if (withInactive) {
      params.set("includeInactive", "true");
    }

    const query = params.toString().length > 0 ? `?${params.toString()}` : "";
    const response = await fetch(`/api/customers${query}`);
    const payload = (await response.json()) as {
      customers?: Customer[];
      error?: { message?: string };
    };

    if (!response.ok || !payload.customers) {
      setStatus(`Ошибка customers: ${payload.error?.message ?? "Не удалось загрузить заказчиков."}`);
      return;
    }

    setCustomers(payload.customers);
    setCustomerDrafts(
      payload.customers.reduce<
        Record<string, { name: string; contact: string; notes: string; isActive: boolean }>
      >((acc, customer) => {
        acc[customer.id] = {
          name: customer.name,
          contact: customer.contact ?? "",
          notes: customer.notes ?? "",
          isActive: customer.isActive,
        };
        return acc;
      }, {}),
    );
    setStatus(`Готово. ${payload.customers.length} заказчиков.`);
  }

  async function loadCategories() {
    const response = await fetch("/api/admin/catalog/categories");
    const payload = (await response.json()) as {
      categories?: Category[];
      error?: { message?: string };
    };
    if (!response.ok || !payload.categories) {
      setStatus(`Ошибка categories: ${payload.error?.message ?? "Не удалось загрузить категории."}`);
      return;
    }
    setCategories(payload.categories);
    setCategoryDrafts(
      payload.categories.reduce<Record<string, { name: string; description: string }>>((acc, category) => {
        acc[category.id] = {
          name: category.name,
          description: category.description ?? "",
        };
        return acc;
      }, {}),
    );
  }

  async function loadItems(search: string) {
    const query = search.trim().length > 0 ? `?search=${encodeURIComponent(search.trim())}` : "";
    const response = await fetch(`/api/admin/catalog/items${query}`);
    const payload = (await response.json()) as {
      items?: Item[];
      error?: { message?: string };
    };
    if (!response.ok || !payload.items) {
      setStatus(`Ошибка items: ${payload.error?.message ?? "Не удалось загрузить позиции."}`);
      return;
    }
    setItems(payload.items);
  }

  async function loadKits() {
    const response = await fetch("/api/admin/catalog/kits");
    const payload = (await response.json()) as {
      kits?: Kit[];
      error?: { message?: string };
    };
    if (!response.ok || !payload.kits) {
      setStatus(`Ошибка kits: ${payload.error?.message ?? "Не удалось загрузить пакеты."}`);
      return;
    }
    setKits(payload.kits);
  }

  async function createOrUpdateUser(event: FormEvent) {
    event.preventDefault();
    setBusyKey("create-user");
    setStatus("Сохраняем пользователя...");

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramId: newTelegramId.trim(),
        username: newUsername.trim() || null,
        role: newRole,
      }),
    });

    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось сохранить пользователя."}`);
      setBusyKey(null);
      return;
    }

    setNewTelegramId("");
    setNewUsername("");
    setNewRole("GREENWICH");
    await loadUsers(userSearch);
    setStatus("Пользователь сохранен.");
    setBusyKey(null);
  }

  async function saveUser(userId: string) {
    const draft = userDrafts[userId];
    if (!draft) {
      return;
    }

    setBusyKey(`user-${userId}`);
    setStatus(`Обновляем пользователя ${userId}...`);

    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: draft.username.trim() || null,
        role: draft.role,
      }),
    });

    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось обновить пользователя."}`);
      setBusyKey(null);
      return;
    }

    await loadUsers(userSearch);
    setStatus(`Пользователь ${userId} обновлен.`);
    setBusyKey(null);
  }

  async function createOrUpdateCustomer(event: FormEvent) {
    event.preventDefault();
    setBusyKey("create-customer");
    setStatus("Сохраняем заказчика...");

    const response = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newCustomerName.trim(),
        contact: newCustomerContact.trim() || null,
        notes: newCustomerNotes.trim() || null,
        isActive: true,
      }),
    });

    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось сохранить заказчика."}`);
      setBusyKey(null);
      return;
    }

    setNewCustomerName("");
    setNewCustomerContact("");
    setNewCustomerNotes("");
    await loadCustomers(customerSearch, includeInactive);
    setStatus("Заказчик сохранен.");
    setBusyKey(null);
  }

  async function saveCustomer(customerId: string) {
    const draft = customerDrafts[customerId];
    if (!draft) {
      return;
    }

    setBusyKey(`customer-${customerId}`);
    setStatus(`Обновляем заказчика ${customerId}...`);

    const response = await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(),
        contact: draft.contact.trim() || null,
        notes: draft.notes.trim() || null,
        isActive: draft.isActive,
      }),
    });

    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось обновить заказчика."}`);
      setBusyKey(null);
      return;
    }

    await loadCustomers(customerSearch, includeInactive);
    setStatus(`Заказчик ${customerId} обновлен.`);
    setBusyKey(null);
  }

  async function createOrUpdateCategory(event: FormEvent) {
    event.preventDefault();
    setBusyKey("create-category");
    const response = await fetch("/api/admin/catalog/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim() || null,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось сохранить категорию."}`);
      setBusyKey(null);
      return;
    }
    setNewCategoryName("");
    setNewCategoryDescription("");
    await loadCategories();
    setStatus("Категория сохранена.");
    setBusyKey(null);
  }

  async function saveCategory(categoryId: string) {
    const draft = categoryDrafts[categoryId];
    if (!draft) {
      return;
    }
    setBusyKey(`category-${categoryId}`);
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
      setBusyKey(null);
      return;
    }
    await loadCategories();
    setStatus("Категория обновлена.");
    setBusyKey(null);
  }

  function selectItem(itemId: string) {
    setSelectedItemId(itemId);
    const item = items.find((entry) => entry.id === itemId);
    if (!item) {
      setItemDraft(null);
      return;
    }
    setItemDraft({
      name: item.name,
      stockTotal: item.stockTotal,
      pricePerDay: item.pricePerDay,
      itemType: item.itemType,
      categoryIds: item.categoryIds,
      imageUrlsText: item.imageUrls.join("\n"),
    });
  }

  async function saveSelectedItem() {
    if (!selectedItemId || !itemDraft) {
      return;
    }
    setBusyKey(`item-${selectedItemId}`);
    const response = await fetch("/api/admin/catalog/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: selectedItemId,
        name: itemDraft.name.trim(),
        stockTotal: itemDraft.stockTotal,
        pricePerDay: itemDraft.pricePerDay,
        itemType: itemDraft.itemType,
        categoryIds: itemDraft.categoryIds,
        imageUrls: itemDraft.imageUrlsText
          .split("\n")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось обновить позицию."}`);
      setBusyKey(null);
      return;
    }
    await loadItems(itemSearch);
    setStatus("Позиция обновлена.");
    setBusyKey(null);
  }

  function addNewKitLine() {
    setNewKitLines((prev) => [...prev, { itemId: "", defaultQty: 1 }]);
  }

  function updateNewKitLine(index: number, patch: Partial<{ itemId: string; defaultQty: number }>) {
    setNewKitLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function createKit(event: FormEvent) {
    event.preventDefault();
    setBusyKey("create-kit");
    const lines = newKitLines
      .filter((line) => line.itemId && line.defaultQty > 0)
      .map((line) => ({
        itemId: line.itemId,
        defaultQty: line.defaultQty,
      }));
    const response = await fetch("/api/admin/catalog/kits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newKitName.trim(),
        description: newKitDescription.trim() || null,
        coverImageUrl: newKitCoverImageUrl.trim() || null,
        lines,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось создать пакет."}`);
      setBusyKey(null);
      return;
    }
    setNewKitName("");
    setNewKitDescription("");
    setNewKitCoverImageUrl("");
    setNewKitLines([{ itemId: "", defaultQty: 1 }]);
    await loadKits();
    setStatus("Пакет сохранен.");
    setBusyKey(null);
  }

  function selectKit(kitId: string) {
    setSelectedKitId(kitId);
    const kit = kits.find((entry) => entry.id === kitId);
    if (!kit) {
      setKitDraft(null);
      return;
    }
    setKitDraft({
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

  function updateKitDraftLine(index: number, patch: Partial<{ itemId: string; defaultQty: number }>) {
    setKitDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
      };
    });
  }

  async function saveSelectedKit() {
    if (!selectedKitId || !kitDraft) {
      return;
    }
    setBusyKey(`kit-${selectedKitId}`);
    const lines = kitDraft.lines
      .filter((line) => line.itemId && line.defaultQty > 0)
      .map((line) => ({ itemId: line.itemId, defaultQty: line.defaultQty }));
    const response = await fetch(`/api/admin/catalog/kits/${selectedKitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: kitDraft.name.trim(),
        description: kitDraft.description.trim() || null,
        coverImageUrl: kitDraft.coverImageUrl.trim() || null,
        isActive: kitDraft.isActive,
        lines,
      }),
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setStatus(`Ошибка: ${payload.error?.message ?? "Не удалось обновить пакет."}`);
      setBusyKey(null);
      return;
    }
    await loadKits();
    setStatus("Пакет обновлен.");
    setBusyKey(null);
  }

  if (!authorized) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Admin Panel</h1>
        <p className="text-sm text-zinc-700">{status}</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Admin Panel</h1>
        <p className="text-sm text-zinc-700">{status}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="space-y-4 rounded border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Доступы пользователей</h2>
            <span className="text-xs text-zinc-500">{usersCountText}</span>
          </div>

          <form className="grid gap-2 sm:grid-cols-[1fr_1fr_130px_auto]" onSubmit={createOrUpdateUser}>
            <input
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
              placeholder="Telegram ID"
              value={newTelegramId}
              onChange={(event) => setNewTelegramId(event.target.value)}
            />
            <input
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
              placeholder="username (опционально)"
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
            />
            <select
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as Role)}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              className="rounded bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
              type="submit"
              disabled={busyKey !== null}
            >
              {busyKey === "create-user" ? "..." : "Добавить/обновить"}
            </button>
          </form>

          <div className="flex items-center gap-2">
            <input
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              placeholder="Поиск по username или telegram ID"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
            />
            <button
              className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100"
              onClick={() => void loadUsers(userSearch)}
              type="button"
            >
              Найти
            </button>
          </div>

          <div className="space-y-2">
            {users.map((user) => {
              const draft = userDrafts[user.id];
              return (
                <div key={user.id} className="rounded border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">
                    id: {user.id} | tg: {user.telegramId}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_130px_auto]">
                    <input
                      className="rounded border border-zinc-300 px-2 py-1 text-sm"
                      value={draft?.username ?? ""}
                      onChange={(event) =>
                        setUserDrafts((prev) => ({
                          ...prev,
                          [user.id]: {
                            username: event.target.value,
                            role: prev[user.id]?.role ?? user.role,
                          },
                        }))
                      }
                    />
                    <select
                      className="rounded border border-zinc-300 px-2 py-1 text-sm"
                      value={draft?.role ?? user.role}
                      onChange={(event) =>
                        setUserDrafts((prev) => ({
                          ...prev,
                          [user.id]: {
                            username: prev[user.id]?.username ?? user.username ?? "",
                            role: event.target.value as Role,
                          },
                        }))
                      }
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50"
                      onClick={() => void saveUser(user.id)}
                      disabled={busyKey !== null}
                      type="button"
                    >
                      {busyKey === `user-${user.id}` ? "..." : "Сохранить"}
                    </button>
                  </div>
                </div>
              );
            })}

            {users.length === 0 ? (
              <div className="rounded border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500">
                Пользователи не загружены.
              </div>
            ) : null}
          </div>
        </article>

        <article className="space-y-4 rounded border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">База заказчиков</h2>
            <span className="text-xs text-zinc-500">{customersCountText}</span>
          </div>

          <form className="grid gap-2 sm:grid-cols-2" onSubmit={createOrUpdateCustomer}>
            <input
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
              placeholder="Название (обязательно)"
              value={newCustomerName}
              onChange={(event) => setNewCustomerName(event.target.value)}
            />
            <input
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
              placeholder="Контакт"
              value={newCustomerContact}
              onChange={(event) => setNewCustomerContact(event.target.value)}
            />
            <input
              className="rounded border border-zinc-300 px-2 py-1 text-sm sm:col-span-2"
              placeholder="Заметки"
              value={newCustomerNotes}
              onChange={(event) => setNewCustomerNotes(event.target.value)}
            />
            <button
              className="rounded bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 sm:col-span-2"
              type="submit"
              disabled={busyKey !== null}
            >
              {busyKey === "create-customer" ? "..." : "Добавить/обновить"}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="min-w-[200px] flex-1 rounded border border-zinc-300 px-2 py-1 text-sm"
              placeholder="Поиск по имени заказчика"
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
            />
            <label className="inline-flex items-center gap-1 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              Включая неактивных
            </label>
            <button
              className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100"
              onClick={() => void loadCustomers(customerSearch, includeInactive)}
              type="button"
            >
              Найти
            </button>
          </div>

          <div className="space-y-2">
            {customers.map((customer) => {
              const draft = customerDrafts[customer.id];
              return (
                <div key={customer.id} className="rounded border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">id: {customer.id}</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input
                      className="rounded border border-zinc-300 px-2 py-1 text-sm"
                      value={draft?.name ?? customer.name}
                      onChange={(event) =>
                        setCustomerDrafts((prev) => ({
                          ...prev,
                          [customer.id]: {
                            name: event.target.value,
                            contact: prev[customer.id]?.contact ?? customer.contact ?? "",
                            notes: prev[customer.id]?.notes ?? customer.notes ?? "",
                            isActive: prev[customer.id]?.isActive ?? customer.isActive,
                          },
                        }))
                      }
                    />
                    <input
                      className="rounded border border-zinc-300 px-2 py-1 text-sm"
                      placeholder="Контакт"
                      value={draft?.contact ?? customer.contact ?? ""}
                      onChange={(event) =>
                        setCustomerDrafts((prev) => ({
                          ...prev,
                          [customer.id]: {
                            name: prev[customer.id]?.name ?? customer.name,
                            contact: event.target.value,
                            notes: prev[customer.id]?.notes ?? customer.notes ?? "",
                            isActive: prev[customer.id]?.isActive ?? customer.isActive,
                          },
                        }))
                      }
                    />
                    <input
                      className="rounded border border-zinc-300 px-2 py-1 text-sm sm:col-span-2"
                      placeholder="Заметки"
                      value={draft?.notes ?? customer.notes ?? ""}
                      onChange={(event) =>
                        setCustomerDrafts((prev) => ({
                          ...prev,
                          [customer.id]: {
                            name: prev[customer.id]?.name ?? customer.name,
                            contact: prev[customer.id]?.contact ?? customer.contact ?? "",
                            notes: event.target.value,
                            isActive: prev[customer.id]?.isActive ?? customer.isActive,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <label className="inline-flex items-center gap-1 text-xs text-zinc-600">
                      <input
                        type="checkbox"
                        checked={draft?.isActive ?? customer.isActive}
                        onChange={(event) =>
                          setCustomerDrafts((prev) => ({
                            ...prev,
                            [customer.id]: {
                              name: prev[customer.id]?.name ?? customer.name,
                              contact: prev[customer.id]?.contact ?? customer.contact ?? "",
                              notes: prev[customer.id]?.notes ?? customer.notes ?? "",
                              isActive: event.target.checked,
                            },
                          }))
                        }
                      />
                      Активен
                    </label>
                    <button
                      className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50"
                      onClick={() => void saveCustomer(customer.id)}
                      disabled={busyKey !== null}
                      type="button"
                    >
                      {busyKey === `customer-${customer.id}` ? "..." : "Сохранить"}
                    </button>
                  </div>
                </div>
              );
            })}

            {customers.length === 0 ? (
              <div className="rounded border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500">
                Заказчики не загружены.
              </div>
            ) : null}
          </div>
        </article>

        <article className="space-y-4 rounded border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Категории подборок</h2>
            <span className="text-xs text-zinc-500">Категорий: {categories.length}</span>
          </div>

          <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={createOrUpdateCategory}>
            <input
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
              placeholder="Название категории"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
            />
            <input
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
              placeholder="Описание"
              value={newCategoryDescription}
              onChange={(event) => setNewCategoryDescription(event.target.value)}
            />
            <button
              className="rounded bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
              type="submit"
              disabled={busyKey !== null}
            >
              {busyKey === "create-category" ? "..." : "Сохранить"}
            </button>
          </form>

          <div className="space-y-2">
            {categories.map((category) => {
              const draft = categoryDrafts[category.id];
              return (
                <div key={category.id} className="rounded border border-zinc-200 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input
                      className="rounded border border-zinc-300 px-2 py-1 text-sm"
                      value={draft?.name ?? category.name}
                      onChange={(event) =>
                        setCategoryDrafts((prev) => ({
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
                        setCategoryDrafts((prev) => ({
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
                      disabled={busyKey !== null}
                    >
                      {busyKey === `category-${category.id}` ? "..." : "Обновить"}
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">Позиций: {category.itemCount}</div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="space-y-4 rounded border border-zinc-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Позиции и фото</h2>
            <span className="text-xs text-zinc-500">Позиции: {items.length}</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              placeholder="Поиск по названию/ID"
              value={itemSearch}
              onChange={(event) => setItemSearch(event.target.value)}
            />
            <button
              className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100"
              type="button"
              onClick={() => void loadItems(itemSearch)}
            >
              Найти
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
            <div className="max-h-72 overflow-auto rounded border border-zinc-200">
              {items.map((item) => (
                <button
                  key={item.id}
                  className={`block w-full border-b border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                    selectedItemId === item.id ? "bg-zinc-100" : ""
                  }`}
                  type="button"
                  onClick={() => selectItem(item.id)}
                >
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-zinc-500">{item.id}</div>
                </button>
              ))}
            </div>

            {itemDraft ? (
              <div className="space-y-2 rounded border border-zinc-200 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="rounded border border-zinc-300 px-2 py-1 text-sm"
                    value={itemDraft.name}
                    onChange={(event) => setItemDraft({ ...itemDraft, name: event.target.value })}
                  />
                  <select
                    className="rounded border border-zinc-300 px-2 py-1 text-sm"
                    value={itemDraft.itemType}
                    onChange={(event) =>
                      setItemDraft({
                        ...itemDraft,
                        itemType: event.target.value as "ASSET" | "BULK" | "CONSUMABLE",
                      })
                    }
                  >
                    <option value="ASSET">ASSET</option>
                    <option value="BULK">BULK</option>
                    <option value="CONSUMABLE">CONSUMABLE</option>
                  </select>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-zinc-600">Stock</span>
                    <input
                      className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                      type="number"
                      min={0}
                      value={itemDraft.stockTotal}
                      onChange={(event) =>
                        setItemDraft({ ...itemDraft, stockTotal: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-zinc-600">Price/day</span>
                    <input
                      className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                      type="number"
                      min={0}
                      step="0.01"
                      value={itemDraft.pricePerDay}
                      onChange={(event) =>
                        setItemDraft({ ...itemDraft, pricePerDay: Number(event.target.value) })
                      }
                    />
                  </label>
                </div>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-zinc-600">Категории</span>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((category) => (
                      <label key={category.id} className="inline-flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={itemDraft.categoryIds.includes(category.id)}
                          onChange={(event) =>
                            setItemDraft({
                              ...itemDraft,
                              categoryIds: event.target.checked
                                ? [...itemDraft.categoryIds, category.id]
                                : itemDraft.categoryIds.filter((entry) => entry !== category.id),
                            })
                          }
                        />
                        {category.name}
                      </label>
                    ))}
                  </div>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-zinc-600">
                    Фото позиции (по 1 URL в строке)
                  </span>
                  <textarea
                    className="h-24 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                    value={itemDraft.imageUrlsText}
                    onChange={(event) =>
                      setItemDraft({ ...itemDraft, imageUrlsText: event.target.value })
                    }
                  />
                </label>

                <button
                  className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
                  type="button"
                  onClick={() => void saveSelectedItem()}
                  disabled={busyKey !== null}
                >
                  {busyKey === `item-${selectedItemId}` ? "..." : "Сохранить позицию"}
                </button>
              </div>
            ) : (
              <div className="rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                Выбери позицию слева для редактирования.
              </div>
            )}
          </div>
        </article>

        <article className="space-y-4 rounded border border-zinc-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Готовые пакеты</h2>
            <span className="text-xs text-zinc-500">Пакетов: {kits.length}</span>
          </div>

          <form className="space-y-2 rounded border border-zinc-200 p-3" onSubmit={createKit}>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
                placeholder="Название пакета"
                value={newKitName}
                onChange={(event) => setNewKitName(event.target.value)}
              />
              <input
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
                placeholder="Описание"
                value={newKitDescription}
                onChange={(event) => setNewKitDescription(event.target.value)}
              />
              <input
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
                placeholder="URL обложки (опционально)"
                value={newKitCoverImageUrl}
                onChange={(event) => setNewKitCoverImageUrl(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              {newKitLines.map((line, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_130px]">
                  <select
                    className="rounded border border-zinc-300 px-2 py-1 text-sm"
                    value={line.itemId}
                    onChange={(event) => updateNewKitLine(index, { itemId: event.target.value })}
                  >
                    <option value="">-- позиция --</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded border border-zinc-300 px-2 py-1 text-sm"
                    type="number"
                    min={1}
                    value={line.defaultQty}
                    onChange={(event) =>
                      updateNewKitLine(index, { defaultQty: Number(event.target.value) })
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100"
                onClick={addNewKitLine}
              >
                + Позиция в пакет
              </button>
            </div>
            <button
              className="rounded bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
              type="submit"
              disabled={busyKey !== null}
            >
              {busyKey === "create-kit" ? "..." : "Создать пакет"}
            </button>
          </form>

          <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
            <div className="max-h-72 overflow-auto rounded border border-zinc-200">
              {kits.map((kit) => (
                <button
                  key={kit.id}
                  className={`block w-full border-b border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                    selectedKitId === kit.id ? "bg-zinc-100" : ""
                  }`}
                  type="button"
                  onClick={() => selectKit(kit.id)}
                >
                  <div className="font-medium">{kit.name}</div>
                  <div className="text-xs text-zinc-500">{kit.id}</div>
                </button>
              ))}
            </div>

            {kitDraft ? (
              <div className="space-y-2 rounded border border-zinc-200 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="rounded border border-zinc-300 px-2 py-1 text-sm"
                    value={kitDraft.name}
                    onChange={(event) => setKitDraft({ ...kitDraft, name: event.target.value })}
                  />
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={kitDraft.isActive}
                      onChange={(event) =>
                        setKitDraft({ ...kitDraft, isActive: event.target.checked })
                      }
                    />
                    Активен
                  </label>
                  <input
                    className="rounded border border-zinc-300 px-2 py-1 text-sm"
                    value={kitDraft.description}
                    onChange={(event) => setKitDraft({ ...kitDraft, description: event.target.value })}
                    placeholder="Описание"
                  />
                  <input
                    className="rounded border border-zinc-300 px-2 py-1 text-sm"
                    value={kitDraft.coverImageUrl}
                    onChange={(event) =>
                      setKitDraft({ ...kitDraft, coverImageUrl: event.target.value })
                    }
                    placeholder="URL обложки"
                  />
                </div>

                <div className="space-y-1">
                  {kitDraft.lines.map((line, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_130px]">
                      <select
                        className="rounded border border-zinc-300 px-2 py-1 text-sm"
                        value={line.itemId}
                        onChange={(event) =>
                          updateKitDraftLine(index, { itemId: event.target.value })
                        }
                      >
                        <option value="">-- позиция --</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="rounded border border-zinc-300 px-2 py-1 text-sm"
                        type="number"
                        min={1}
                        value={line.defaultQty}
                        onChange={(event) =>
                          updateKitDraftLine(index, { defaultQty: Number(event.target.value) })
                        }
                      />
                    </div>
                  ))}
                </div>

                <button
                  className="rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
                  type="button"
                  onClick={() => void saveSelectedKit()}
                  disabled={busyKey !== null}
                >
                  {busyKey === `kit-${selectedKitId}` ? "..." : "Сохранить пакет"}
                </button>
              </div>
            ) : (
              <div className="rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                Выбери пакет слева для редактирования.
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
