import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getResource } from "@/lib/admin/resources";
import { deleteRecord, togglePublish } from "@/lib/admin/actions";
import { displayCell } from "@/lib/admin/format";
import { DeleteButton } from "@/components/admin/DeleteButton";

export const dynamic = "force-dynamic";

type Delegate = {
  findMany: (a?: unknown) => Promise<Record<string, unknown>[]>;
};

const PAGE_SIZE = 50;

export default async function ResourceListPage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{
    filter?: string;
    q?: string;
    page?: string;
    saved?: string;
    deleted?: string;
  }>;
}) {
  const { resource: key } = await params;
  const { filter, q, page, saved, deleted } = await searchParams;
  const resource = getResource(key);
  if (!resource) notFound();
  if (resource.adminOnly) await requireAdmin();
  else await requireUser();

  const delegate = (prisma as unknown as Record<string, Delegate>)[resource.model];
  const where = filter === "pending" && resource.moderated ? { published: false } : {};
  const sort = resource.defaultSort ?? { field: "createdAt", dir: "desc" as const };
  const allRows = await delegate.findMany({
    where,
    orderBy: { [sort.field]: sort.dir },
    take: 5000,
  });

  const cols = resource.fields.filter((f) => f.listVisible);
  const hasPublished = resource.fields.some((f) => f.name === "published");

  const query = (q ?? "").trim().toLowerCase();
  const filtered = query
    ? allRows.filter((row) => {
        const hay = [resource.titleField, ...cols.map((c) => c.name)]
          .map((f) => String(row[f] ?? ""))
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      })
    : allRows;

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const qs = (extra: Record<string, string | number>) => {
    const pp = new URLSearchParams();
    if (filter) pp.set("filter", filter);
    if (query) pp.set("q", q ?? "");
    for (const [k, v] of Object.entries(extra)) pp.set(k, String(v));
    const s = pp.toString();
    return `/admin/${resource.key}${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{resource.labelPlural}</h1>
        <Link href={`/admin/${resource.key}/new`} className="btn-primary">
          + Нов запис
        </Link>
      </div>

      {saved && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Записът е запазен.
        </div>
      )}
      {deleted && (
        <div className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">
          Записът е изтрит.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {resource.moderated ? (
          <div className="flex gap-2 text-sm">
            <Link
              href={qs({})}
              className={
                "rounded-full px-3 py-1.5 " +
                (!filter ? "bg-brand-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-300")
              }
            >
              Всички
            </Link>
            <Link
              href={`/admin/${resource.key}?filter=pending`}
              className={
                "rounded-full px-3 py-1.5 " +
                (filter === "pending"
                  ? "bg-amber-500 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-300")
              }
            >
              Скрити / чакащи
            </Link>
          </div>
        ) : (
          <div />
        )}

        <form method="get" className="flex items-center gap-2">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Търсене в списъка…"
            className="input w-56"
            aria-label="Търсене в списъка"
          />
          <button type="submit" className="btn-secondary">
            Търси
          </button>
        </form>
      </div>

      <div className="text-sm text-slate-500">
        {query ? (
          <>
            Намерени: <strong>{total}</strong> за „{q}“
          </>
        ) : (
          <>
            Общо записи: <strong>{total}</strong>
          </>
        )}
        {pages > 1 && (
          <>
            {" "}
            · страница {current} от {pages}
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left">
            <tr>
              {cols.map((c) => (
                <th key={c.name} className="p-3 font-semibold text-slate-600">
                  {c.label}
                </th>
              ))}
              <th className="p-3 text-right font-semibold text-slate-600">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length + 1} className="p-6 text-center text-slate-500">
                  {query ? "Няма съвпадения за търсенето." : "Няма записи. Добавете първия."}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = String(row.id);
                return (
                  <tr key={id} className="align-top">
                    {cols.map((c, i) => (
                      <td key={c.name} className="p-3 text-slate-700">
                        {i === 0 ? (
                          <span className="flex items-center gap-2">
                            {hasPublished && !row.published && (
                              <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500"
                                title="Скрито / чака одобрение"
                                aria-label="Скрито"
                              />
                            )}
                            <Link
                              href={`/admin/${resource.key}/${id}`}
                              className="font-medium text-brand-800 hover:underline"
                            >
                              {displayCell(c, row[c.name])}
                            </Link>
                          </span>
                        ) : (
                          displayCell(c, row[c.name])
                        )}
                      </td>
                    ))}
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/admin/${resource.key}/${id}`}
                          className="text-sm font-medium text-slate-700 hover:underline"
                        >
                          Редакция
                        </Link>
                        {hasPublished && (
                          <form
                            action={togglePublish.bind(null, resource.key, id, !row.published)}
                          >
                            <button className="text-sm font-medium text-brand-800 hover:underline">
                              {row.published ? "Скрий" : "Публикувай"}
                            </button>
                          </form>
                        )}
                        <DeleteButton action={deleteRecord.bind(null, resource.key, id)} />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          {current > 1 ? (
            <Link href={qs({ page: current - 1 })} className="btn-secondary">
              ← Предишна
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-500">
            страница {current} от {pages}
          </span>
          {current < pages ? (
            <Link href={qs({ page: current + 1 })} className="btn-secondary">
              Следваща →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
