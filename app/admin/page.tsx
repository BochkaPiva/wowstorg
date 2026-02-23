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
      </div>
    </section>
  );
}
