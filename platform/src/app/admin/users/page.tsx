import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import {
  toggleUserActiveAction,
  deleteUserAction,
} from "@/lib/admin/actions";
import { formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminUsers() {
  const me = await requireOwner();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { memberships: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">Акаунти</h1>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ink-800">
              <th className="th">Име</th>
              <th className="th">Имейл</th>
              <th className="th">Роля</th>
              <th className="th">Сайтове</th>
              <th className="th">Влизане</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                <td className="td font-medium text-white">{u.name}</td>
                <td className="td">{u.email}</td>
                <td className="td">
                  {u.role === "OWNER" ? "Собственик" : "Член"}
                </td>
                <td className="td">
                  {u.role === "OWNER" ? "всички" : u._count.memberships}
                </td>
                <td className="td">{formatRelative(u.lastLoginAt)}</td>
                <td className="td">
                  {u.id === me.id ? (
                    <span className="text-xs text-ink-500">това сте вие</span>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <form action={toggleUserActiveAction.bind(null, u.id)}>
                        <button className="text-xs text-ink-400 hover:text-ink-200">
                          {u.active ? "Деактивирай" : "Активирай"}
                        </button>
                      </form>
                      <form action={deleteUserAction.bind(null, u.id)}>
                        <button className="text-xs text-red-400 hover:text-red-300">
                          Изтрий
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card">
        <h2 className="mb-3 font-medium text-white">Нов акаунт</h2>
        <CreateUserForm />
      </section>
    </div>
  );
}
