import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { accessibleSites } from "@/lib/access";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelative, formatMs } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const sites = await accessibleSites(user);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Моите сайтове</h1>
          <p className="text-sm text-ink-400">
            {sites.length === 0
              ? "Все още нямате достъп до сайтове."
              : `${sites.length} ${sites.length === 1 ? "сайт" : "сайта"}`}
          </p>
        </div>
        {user.role === "OWNER" && (
          <Link href="/admin/sites/new" className="btn-primary">
            + Свържи сайт
          </Link>
        )}
      </div>

      {sites.length === 0 ? (
        <div className="card text-center text-ink-400">
          {user.role === "OWNER" ? (
            <p>
              Няма свързани сайтове. Започнете със{" "}
              <Link href="/admin/sites/new" className="text-brand-400 underline">
                свързване на сайт
              </Link>
              .
            </p>
          ) : (
            <p>
              Собственикът още не ви е дал достъп до сайт. Свържете се с
              администратора.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <Link
              key={site.id}
              href={`/dashboard/sites/${site.slug}`}
              className="card transition hover:border-brand-600"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-medium text-white">{site.name}</h2>
                  <p className="truncate text-xs text-ink-500">{site.url}</p>
                </div>
                <StatusBadge status={site.status} />
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs text-ink-400">
                <div>
                  <dt className="text-ink-500">Последна проверка</dt>
                  <dd>{formatRelative(site.lastCheckAt)}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">Отговор</dt>
                  <dd>{formatMs(site.lastResponseMs)}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
