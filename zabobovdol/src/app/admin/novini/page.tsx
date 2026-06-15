import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runNewsImport } from "@/lib/admin/news-actions";
import { togglePublish, deleteRecord } from "@/lib/admin/actions";
import { DeleteButton } from "@/components/admin/DeleteButton";

export const dynamic = "force-dynamic";

export default async function AdminNewsImportPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; skipped?: string; found?: string; error?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;

  const drafts = await prisma.post.findMany({
    where: { published: false, source: { not: "" } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Новини от общината</h1>
          <p className="max-w-2xl text-slate-600">
            Внесете новини от сайта на общината като чернови, прегледайте ги и ги
            публикувайте. Внасят се заглавие, кратко резюме и линк към оригинала.
          </p>
        </div>
        <form action={runNewsImport}>
          <button className="btn-primary">⟳ Внеси новини</button>
        </form>
      </div>

      {sp.found !== undefined && !sp.error && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Готово. Намерени: {sp.found} · нови чернови: <strong>{sp.created}</strong> ·
          пропуснати (вече ги има): {sp.skipped}.
        </div>
      )}
      {sp.error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {sp.error} Проверете адреса на източника (MUNICIPALITY_NEWS_URL).
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Чакащи преглед ({drafts.length})
        </h2>
        {drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            Няма внесени чернови. Натиснете „Внеси новини“.
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map((d) => (
              <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{d.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {d.source}
                      {d.sourceDate
                        ? " · " +
                          new Intl.DateTimeFormat("bg-BG", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          }).format(d.sourceDate)
                        : ""}
                    </div>
                    {d.excerpt && <p className="mt-1 text-sm text-slate-600">{d.excerpt}</p>}
                    {d.sourceUrl && (
                      <a
                        href={d.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block break-all text-xs text-brand-700 hover:underline"
                      >
                        ↗ оригинал в сайта на общината
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Link href={`/admin/posts/${d.id}`} className="text-sm text-slate-700 hover:underline">
                      Редакция
                    </Link>
                    <form action={togglePublish.bind(null, "posts", d.id, true)}>
                      <button className="text-sm font-medium text-green-700 hover:underline">
                        Публикувай
                      </button>
                    </form>
                    <DeleteButton action={deleteRecord.bind(null, "posts", d.id)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Съвет: можете да настроите автоматично внасяне по график (cron) на VPS-а,
        който да извиква защитения адрес <code>/api/ingest-news?token=…</code>.
        Публикуването винаги остава ръчно.
      </p>
    </div>
  );
}
