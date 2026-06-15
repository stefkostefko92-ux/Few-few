import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateUser } from "@/lib/admin/user-actions";

export const dynamic = "force-dynamic";

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Редакция на потребител</h1>
        <Link href="/admin/users" className="btn-secondary">Назад</Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <form
        action={updateUser.bind(null, user.id)}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
      >
        <div>
          <label className="label">Имейл</label>
          <input value={user.email} disabled className="input bg-slate-100" />
        </div>
        <div>
          <label className="label" htmlFor="name">Име</label>
          <input id="name" name="name" defaultValue={user.name} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="role">Роля</label>
          <select id="role" name="role" defaultValue={user.role} className="input">
            <option value="EDITOR">Редактор</option>
            <option value="ADMIN">Администратор</option>
          </select>
        </div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="active"
            defaultChecked={user.active}
            className="h-5 w-5 rounded border-slate-300"
          />
          <span className="font-medium text-slate-800">Активен достъп</span>
        </label>
        <div>
          <label className="label" htmlFor="password">Нова парола (по избор)</label>
          <input
            id="password"
            name="password"
            type="text"
            placeholder="Оставете празно, за да не сменяте"
            className="input"
          />
        </div>
        <button type="submit" className="btn-primary">Запази</button>
      </form>
    </div>
  );
}
