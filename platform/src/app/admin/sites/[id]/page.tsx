import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SiteForm } from "@/components/admin/SiteForm";
import { AddMembershipForm } from "@/components/admin/AddMembershipForm";
import {
  updateSiteAction,
  deleteSiteAction,
  toggleMonitorAction,
  addMembershipAction,
  removeMembershipAction,
} from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

export default async function EditSite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      memberships: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!site) notFound();

  // Акаунти, които още нямат достъп до този сайт (само роля MEMBER;
  // собствениците и без това виждат всичко).
  const assignedIds = site.memberships.map((m) => m.userId);
  const candidates = await prisma.user.findMany({
    where: { role: "MEMBER", active: true, id: { notIn: assignedIds } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/admin/sites" className="text-xs text-ink-500 hover:text-ink-300">
          ← Сайтове
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">{site.name}</h1>
        <Link
          href={`/dashboard/sites/${site.slug}`}
          className="text-sm text-brand-400 hover:underline"
        >
          Отвори таблото на сайта →
        </Link>
      </div>

      {/* Настройки */}
      <div className="card">
        <h2 className="mb-4 font-medium text-white">Настройки</h2>
        <SiteForm
          action={updateSiteAction.bind(null, site.id)}
          submitLabel="Запази"
          values={{
            name: site.name,
            slug: site.slug,
            url: site.url,
            apiBaseUrl: site.apiBaseUrl,
            deployHookUrl: site.deployHookUrl,
            notes: site.notes,
            hasKey: Boolean(site.apiKeyEnc),
          }}
        />
      </div>

      {/* Достъп на акаунти */}
      <div className="card">
        <h2 className="mb-3 font-medium text-white">Кой има достъп</h2>
        {site.memberships.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {site.memberships.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded border border-ink-800 px-3 py-2 text-sm"
              >
                <span>
                  <span className="text-white">{m.user.name}</span>{" "}
                  <span className="text-ink-500">({m.user.email})</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="rounded bg-ink-800 px-2 py-0.5 text-xs">
                    {m.role === "MANAGER" ? "мениджър" : "наблюдател"}
                  </span>
                  <form action={removeMembershipAction.bind(null, site.id, m.id)}>
                    <button className="text-xs text-red-400 hover:text-red-300">
                      Премахни
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-ink-500">
            Никой член няма достъп до този сайт.
          </p>
        )}
        <AddMembershipForm
          action={addMembershipAction.bind(null, site.id)}
          users={candidates}
        />
      </div>

      {/* Опасна зона */}
      <div className="card border-red-900/50">
        <h2 className="mb-3 font-medium text-white">Управление</h2>
        <div className="flex flex-wrap items-center gap-3">
          <form action={toggleMonitorAction.bind(null, site.id)}>
            <button className="btn-ghost">
              {site.monitorEnabled ? "Спри мониторинга" : "Пусни мониторинга"}
            </button>
          </form>
          <form action={deleteSiteAction.bind(null, site.id)}>
            <button className="btn-danger">Изтрий сайта</button>
          </form>
        </div>
      </div>
    </div>
  );
}
