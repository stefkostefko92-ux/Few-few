import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/categories";
import { createUser, deleteUser } from "@/lib/admin/user-actions";
import { DeleteButton } from "@/components/admin/DeleteButton";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; deleted?: string }>;
}) {
  const me = await requireAdmin();
  const { error, saved, deleted } = await searchParams;
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Потребители</h1>

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">Запазено.</div>
      )}
      {deleted && (
        <div className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">Изтрито.</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-semibold text-slate-600">Име</th>
              <th className="p-3 font-semibold text-slate-600">Имейл</th>
              <th className="p-3 font-semibold text-slate-600">Роля</th>
              <th className="p-3 font-semibold text-slate-600">Активен</th>
              <th className="p-3 font-semibold text-slate-600">Последен вход</th>
              <th className="p-3 text-right font-semibold text-slate-600">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="p-3 font-medium text-slate-800">{u.name}</td>
                <td className="p-3 text-slate-700">{u.email}</td>
                <td className="p-3">{ROLE_LABELS[u.role]}</td>
                <td className="p-3">{u.active ? "Да" : "Не"}</td>
                <td className="p-3 text-slate-500">
                  {u.lastLoginAt
                    ? new Intl.DateTimeFormat("bg-BG", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(u.lastLoginAt)
                    : "—"}
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-sm font-medium text-brand-800 hover:underline"
                    >
                      Редакция
                    </Link>
                    {u.id !== me.id && <DeleteButton action={deleteUser.bind(null, u.id)} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Нов потребител</h2>
        <form action={createUser} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">
              Име
            </label>
            <input id="name" name="name" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Имейл
            </label>
            <input id="email" name="email" type="email" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="role">
              Роля
            </label>
            <select id="role" name="role" className="input">
              <option value="EDITOR">Редактор</option>
              <option value="ADMIN">Администратор</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="password">
              Парола (мин. 8 знака)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="input"
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">
              Създай потребител
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
