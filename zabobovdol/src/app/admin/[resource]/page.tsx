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

export default async function ResourceListPage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ filter?: string; saved?: string; deleted?: string }>;
}) {
  const { resource: key } = await params;
  const { filter, saved, deleted } = await searchParams;
  const resource = getResource(key);
  if (!resource) notFound();
  // Ресурсите, маркирани adminOnly (напр. банери), са само за роля ADMIN.
  if (resource.adminOnly) await requireAdmin();
  else await requireUser();

  const delegate = (prisma as unknown as Record<string, Delegate>)[resource.model];
  const where =
    filter === "pending" && resource.moderated ? { published: false } : {};
  const sort = resource.defaultSort ?? { field: "createdAt", dir: "desc" as const };
  const rows = await delegate.findMany({
    where,
    orderBy: { [sort.field]: sort.dir },
    take: 300,
  });

  const cols = resource.fields.filter((f) => f.listVisible);
  const hasPublished = resource.fields.some((f) => f.name === "published");

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

      {resource.moderated && (
        <div className="flex gap-2 text-sm">
          <Link
            href={`/admin/${resource.key}`}
            className={
              "rounded-full px-3 py-1.5 " +
              (!filter ? "bg-brand-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-300")
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
            Чакащи одобрение
          </Link>
        </div>
      )}

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
                  Няма записи. Добавете първия.
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
                          <Link
                            href={`/admin/${resource.key}/${id}`}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {displayCell(c, row[c.name])}
                          </Link>
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
                            action={togglePublish.bind(
                              null,
                              resource.key,
                              id,
                              !row.published,
                            )}
                          >
                            <button className="text-sm font-medium text-brand-700 hover:underline">
                              {row.published ? "Скрий" : "Публикувай"}
                            </button>
                          </form>
                        )}
                        <DeleteButton
                          action={deleteRecord.bind(null, resource.key, id)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
