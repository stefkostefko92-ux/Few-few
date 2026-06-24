import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const FORBIDDEN_MSG =
  "Нямате достъп до тази част. Тя е достъпна само за администратори.";

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

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const { error } = await searchParams;

  const [posts, pendingPosts, matches, standings, players, staff, honours, gallery, sponsors, pendingContact, recentAudit] =
    await Promise.all([
      prisma.post.count(),
      prisma.post.count({ where: { published: false } }),
      prisma.match.count(),
      prisma.standingRow.count(),
      prisma.player.count(),
      prisma.staff.count(),
      prisma.honourItem.count(),
      prisma.galleryPhoto.count(),
      prisma.sponsor.count(),
      prisma.contactMessage.count({ where: { handled: false } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Табло</h1>
        <p className="text-slate-600">Преглед на съдържанието и последна активност.</p>
      </div>

      <details className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold text-brand-800">
          Първи стъпки — как се поддържа сайтът
        </summary>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Натиснете <strong>карта</strong> по-долу или раздел от менюто вляво.</li>
          <li>Бутон <strong>„+ Нов запис“</strong> добавя, „Редакция“ променя съществуващ.</li>
          <li><strong>„Публикувано“</strong> значи видимо в сайта. Махнете отметката, за да скриете, без да триете.</li>
          <li>След мач попълнете головете и сменете статуса на „Завършил“ — резултатът се показва автоматично.</li>
        </ul>
      </details>

      {error === "forbidden" && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          {FORBIDDEN_MSG}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={pendingPosts > 0 ? `Новини (скрити: ${pendingPosts})` : "Новини"}
          value={posts}
          href="/admin/novini"
          accent={pendingPosts > 0}
        />
        <StatCard label="Мачове" value={matches} href="/admin/programa" />
        <StatCard label="Класиране" value={standings} href="/admin/klasirane" />
        <StatCard label="Състав" value={players} href="/admin/sastav" />
        <StatCard label="Треньорски щаб" value={staff} href="/admin/shtab" />
        <StatCard label="История" value={honours} href="/admin/istoriya" />
        <StatCard label="Галерия" value={gallery} href="/admin/galeriya" />
        <StatCard label="Спонсори" value={sponsors} href="/admin/sponsori" />
        {isAdmin && (
          <StatCard
            label={pendingContact > 0 ? `Съобщения (нови: ${pendingContact})` : "Съобщения"}
            value={pendingContact}
            href="/admin/saobshteniya"
            accent={pendingContact > 0}
          />
        )}
      </div>

      {isAdmin && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Последна активност</h2>
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
                      <td className="p-3 text-right text-slate-600">{a.userEmail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-right">
            <Link href="/admin/audit" className="text-sm text-brand-800 hover:underline">
              Целият одит лог →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
