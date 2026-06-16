import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const { page } = await searchParams;
  const p = Math.max(1, Number(page) || 1);
  const perPage = 50;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (p - 1) * perPage,
      take: perPage,
    }),
    prisma.auditLog.count(),
  ]);
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">Одит лог</h1>
      <p className="text-slate-600">Хронология на промените в съдържанието и достъпа.</p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-semibold text-slate-600">Дата</th>
              <th className="p-3 font-semibold text-slate-600">Действие</th>
              <th className="p-3 font-semibold text-slate-600">Описание</th>
              <th className="p-3 font-semibold text-slate-600">Потребител</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-slate-500">
                  Няма записи.
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap p-3 text-slate-500">
                    {new Intl.DateTimeFormat("bg-BG", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(l.createdAt)}
                  </td>
                  <td className="p-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {l.action}
                    </span>
                  </td>
                  <td className="p-3 text-slate-700">{l.summary}</td>
                  <td className="p-3 text-slate-500">{l.userEmail}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <a
              key={n}
              href={`/admin/audit?page=${n}`}
              className={
                "rounded px-3 py-1.5 " +
                (n === p ? "bg-brand-700 text-white" : "bg-white ring-1 ring-slate-300")
              }
            >
              {n}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
