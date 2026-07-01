import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/StatusBadge";
import { ActionButton } from "@/components/ActionButton";
import { AddLinkForm } from "@/components/AddLinkForm";
import { formatDateTime, formatRelative, formatMs } from "@/lib/format";
import {
  checkNowAction,
  syncContentAction,
  deployAction,
  addLinkAction,
  deleteLinkAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function SitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "read");
  if (!found) notFound();
  const { site, role } = found;
  const canManage = role === "MANAGER";

  const [checks, content, links, deployments] = await Promise.all([
    prisma.healthCheck.findMany({
      where: { siteId: site.id },
      orderBy: { checkedAt: "desc" },
      take: 10,
    }),
    prisma.contentItem.findMany({
      where: { siteId: site.id },
      orderBy: { syncedAt: "desc" },
      take: 20,
    }),
    prisma.siteLink.findMany({
      where: { siteId: site.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.deployment.findMany({
      where: { siteId: site.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <div className="space-y-6">
      {/* Заглавие */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-xs text-ink-500 hover:text-ink-300">
            ← Табло
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-xl font-semibold text-white">
            {site.name}
            <StatusBadge status={site.status} />
          </h1>
          <a
            href={site.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-brand-400 hover:underline"
          >
            {site.url}
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/sites/${slug}/pages`}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            🧩 Конструктор на страници
          </Link>
          <Link
            href={`/dashboard/sites/${slug}/submissions`}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            📨 Заявки
          </Link>
          {canManage && (
            <Link
              href={`/dashboard/sites/${slug}/settings`}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              ⚙️ Настройки
            </Link>
          )}
          <span className="rounded bg-ink-800 px-2 py-1 text-xs text-ink-400">
            Вашата роля: {role === "MANAGER" ? "мениджър" : "наблюдател"}
          </span>
        </div>
      </div>

      {/* Мониторинг */}
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-white">Мониторинг</h2>
          {canManage && (
            <ActionButton
              action={checkNowAction.bind(null, slug)}
              label="Провери сега"
              pendingLabel="Проверка…"
            />
          )}
        </div>
        <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Статус" value={<StatusBadge status={site.status} />} />
          <Stat label="Код" value={site.lastStatusCode ?? "—"} />
          <Stat label="Отговор" value={formatMs(site.lastResponseMs)} />
          <Stat label="Проверено" value={formatRelative(site.lastCheckAt)} />
        </dl>
        {checks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Време</th>
                  <th className="th">Резултат</th>
                  <th className="th">Код</th>
                  <th className="th">Отговор</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {checks.map((c) => (
                  <tr key={c.id}>
                    <td className="td">{formatDateTime(c.checkedAt)}</td>
                    <td className="td">
                      {c.ok ? (
                        <span className="text-green-400">OK</span>
                      ) : (
                        <span className="text-red-400">{c.error ?? "Неуспех"}</span>
                      )}
                    </td>
                    <td className="td">{c.statusCode ?? "—"}</td>
                    <td className="td">{formatMs(c.responseMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-500">Още няма проверки.</p>
        )}
      </section>

      {/* Съдържание (CMS прокси) */}
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-white">Съдържание</h2>
          {canManage && (
            <ActionButton
              action={syncContentAction.bind(null, slug)}
              label="Синхронизирай"
              pendingLabel="Синхронизация…"
            />
          )}
        </div>
        {!site.apiBaseUrl ? (
          <p className="text-sm text-ink-500">
            Няма зададен API адрес. Добавете го от настройките на сайта, за да
            издърпвате съдържание.
          </p>
        ) : content.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Заглавие</th>
                  <th className="th">Тип</th>
                  <th className="th">Статус</th>
                  <th className="th">Синхр.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {content.map((it) => (
                  <tr key={it.id}>
                    <td className="td">
                      {it.url ? (
                        <a
                          href={it.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-400 hover:underline"
                        >
                          {it.title}
                        </a>
                      ) : (
                        it.title
                      )}
                    </td>
                    <td className="td">{it.kind}</td>
                    <td className="td">{it.status ?? "—"}</td>
                    <td className="td">{formatRelative(it.syncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-500">
            Няма синхронизирано съдържание. Натиснете „Синхронизирай“.
          </p>
        )}
      </section>

      {/* Деплой */}
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-white">Деплой</h2>
          {canManage && (site.deployHookUrl || site.apiBaseUrl) && (
            <ActionButton
              action={deployAction.bind(null, slug)}
              label="Задействай деплой"
              pendingLabel="Деплой…"
              variant="primary"
              confirm="Сигурни ли сте, че искате да задействате деплой?"
            />
          )}
        </div>
        {!site.deployHookUrl && !site.apiBaseUrl ? (
          <p className="text-sm text-ink-500">Няма зададен адрес за деплой.</p>
        ) : deployments.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {deployments.map((d) => (
              <li key={d.id} className="flex items-center justify-between">
                <span className="text-ink-300">{formatDateTime(d.createdAt)}</span>
                <span className="text-ink-500">{d.triggeredByEmail}</span>
                <DeployBadge status={d.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-500">Още няма задействани деплои.</p>
        )}
      </section>

      {/* Хъб: връзки */}
      <section className="card">
        <h2 className="mb-3 font-medium text-white">Връзки и ресурси</h2>
        {links.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {links.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 rounded border border-ink-800 px-3 py-2"
              >
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-brand-400 hover:underline"
                >
                  {l.label}
                </a>
                {canManage && (
                  <ActionButton
                    action={deleteLinkAction.bind(null, slug, l.id)}
                    label="Изтрий"
                    variant="danger"
                    confirm={`Изтриване на „${l.label}"?`}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-ink-500">Няма добавени връзки.</p>
        )}
        {canManage && <AddLinkForm action={addLinkAction.bind(null, slug)} />}
      </section>

      {/* Бележки */}
      {site.notes && (
        <section className="card">
          <h2 className="mb-2 font-medium text-white">Бележки</h2>
          <p className="whitespace-pre-wrap text-sm text-ink-300">{site.notes}</p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-ink-800 px-3 py-2">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-100">{value}</dd>
    </div>
  );
}

function DeployBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    SUCCESS: "text-green-400",
    FAILED: "text-red-400",
    RUNNING: "text-amber-400",
    PENDING: "text-ink-400",
  };
  const label: Record<string, string> = {
    SUCCESS: "успех",
    FAILED: "неуспех",
    RUNNING: "изпълнява се",
    PENDING: "чака",
  };
  return (
    <span className={`text-xs ${map[status] ?? "text-ink-400"}`}>
      {label[status] ?? status}
    </span>
  );
}
