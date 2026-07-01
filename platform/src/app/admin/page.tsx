import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [siteCount, userCount, memberCount, audit] = await Promise.all([
    prisma.site.count(),
    prisma.user.count(),
    prisma.membership.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">Администрация</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/sites" className="card hover:border-brand-600">
          <p className="text-3xl font-semibold text-white">{siteCount}</p>
          <p className="text-sm text-ink-400">Свързани сайтове →</p>
        </Link>
        <Link href="/admin/users" className="card hover:border-brand-600">
          <p className="text-3xl font-semibold text-white">{userCount}</p>
          <p className="text-sm text-ink-400">Акаунти →</p>
        </Link>
        <div className="card">
          <p className="text-3xl font-semibold text-white">{memberCount}</p>
          <p className="text-sm text-ink-400">Дадени достъпи</p>
        </div>
      </div>

      <section className="card">
        <h2 className="mb-3 font-medium text-white">Одит (последни действия)</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-ink-500">Още няма записи.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Време</th>
                  <th className="th">Кой</th>
                  <th className="th">Действие</th>
                  <th className="th">Описание</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="td whitespace-nowrap">
                      {formatDateTime(a.createdAt)}
                    </td>
                    <td className="td">{a.userEmail}</td>
                    <td className="td">
                      <span className="rounded bg-ink-800 px-1.5 py-0.5 text-xs">
                        {a.action}
                      </span>
                    </td>
                    <td className="td">{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
