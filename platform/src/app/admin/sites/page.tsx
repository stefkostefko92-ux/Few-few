import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminSites() {
  const sites = await prisma.site.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { memberships: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Сайтове</h1>
        <Link href="/admin/sites/new" className="btn-primary">
          + Свържи сайт
        </Link>
      </div>

      {sites.length === 0 ? (
        <div className="card text-sm text-ink-400">Няма свързани сайтове.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-800">
                <th className="th">Име</th>
                <th className="th">Статус</th>
                <th className="th">Достъпи</th>
                <th className="th">Проверено</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {sites.map((s) => (
                <tr key={s.id}>
                  <td className="td">
                    <div className="font-medium text-white">{s.name}</div>
                    <div className="text-xs text-ink-500">{s.url}</div>
                  </td>
                  <td className="td">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="td">{s._count.memberships}</td>
                  <td className="td">{formatRelative(s.lastCheckAt)}</td>
                  <td className="td text-right">
                    <Link
                      href={`/admin/sites/${s.id}`}
                      className="text-brand-400 hover:underline"
                    >
                      Настройки
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
