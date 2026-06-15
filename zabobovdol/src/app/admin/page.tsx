import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md " +
        (accent ? "border-amber-300" : "border-slate-200")
      }
    >
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{label}</div>
    </Link>
  );
}

export default async function AdminDashboard() {
  await requireUser();

  const [
    faq,
    services,
    business,
    events,
    listings,
    pendingListings,
    posts,
    misses,
    recentAudit,
  ] = await Promise.all([
    prisma.faq.count(),
    prisma.service.count(),
    prisma.business.count(),
    prisma.event.count(),
    prisma.listing.count(),
    prisma.listing.count({ where: { published: false } }),
    prisma.post.count(),
    prisma.searchMiss.count({ where: { resolved: false } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Табло</h1>
        <p className="text-slate-600">Преглед на съдържанието и последна активност.</p>
      </div>

      {pendingListings > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          Имате <strong>{pendingListings}</strong> обяви, които чакат одобрение.{" "}
          <Link href="/admin/listings?filter=pending" className="font-semibold underline">
            Прегледай сега →
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Въпроси „Как да…“" value={faq} href="/admin/faq" />
        <StatCard label="Услуги и телефони" value={services} href="/admin/services" />
        <StatCard label="Местен бизнес" value={business} href="/admin/business" />
        <StatCard label="Събития" value={events} href="/admin/events" />
        <StatCard
          label={`Обяви (чакащи: ${pendingListings})`}
          value={listings}
          href="/admin/listings"
          accent={pendingListings > 0}
        />
        <StatCard label="Новини" value={posts} href="/admin/posts" />
        <StatCard
          label="Търсения без резултат"
          value={misses}
          href="/admin/search-misses"
          accent={misses > 0}
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Последна активност
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {recentAudit.length === 0 ? (
                <tr>
                  <td className="p-4 text-slate-500">Все още няма активност.</td>
                </tr>
              ) : (
                recentAudit.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap p-3 text-slate-500">
                      {new Intl.DateTimeFormat("bg-BG", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(a.createdAt)}
                    </td>
                    <td className="p-3 text-slate-700">{a.summary}</td>
                    <td className="p-3 text-right text-slate-400">{a.userEmail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-right">
          <Link href="/admin/audit" className="text-sm text-brand-700 hover:underline">
            Целият одит лог →
          </Link>
        </div>
      </div>
    </div>
  );
}
