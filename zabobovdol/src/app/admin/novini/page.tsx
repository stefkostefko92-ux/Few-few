import Link from "next/link";
import { RefreshCw } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteNotNewsDrafts, runNewsImport } from "@/lib/admin/news-actions";
import { togglePublish, deleteRecord } from "@/lib/admin/actions";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { isNotNewsDraft, newsPatterns } from "./drafts";
import { DeleteNotNewsButton } from "./DeleteNotNewsButton";

export const dynamic = "force-dynamic";

const SHOWN = 50;
const MAX_DELETE = 200;

// Числата идват от адреса след внасянето — показваме само цели числа.
function num(s: string | undefined): number | undefined {
  return s && /^\d{1,6}$/.test(s) ? Number(s) : undefined;
}

// Само http(s) връзки към оригинала — никога javascript: и подобни.
function safeHref(u: string): string | null {
  return /^https?:\/\//i.test(u) ? u : null;
}

const dateFmt = new Intl.DateTimeFormat("bg-BG", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function AdminNewsImportPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    skipped?: string;
    found?: string;
    pending?: string;
    withoutDate?: string;
    removed?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const found = num(sp.found);
  const pendingAfter = num(sp.pending);
  const withoutDate = num(sp.withoutDate);
  const removed = num(sp.removed);

  const drafts = await prisma.post.findMany({
    where: { published: false, source: { not: "" } },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      id: true,
      title: true,
      excerpt: true,
      source: true,
      sourceUrl: true,
      sourceDate: true,
    },
  });

  // Старите страници от менюто на общината не са новини — не ги предлагаме за
  // публикуване (критерият е в ./drafts.ts).
  const patterns = newsPatterns(process.env.MUNICIPALITY_NEWS_LINK_PATTERN);
  const notNews = drafts.filter((d) => isNotNewsDraft(d, patterns));
  const pending = drafts.filter((d) => !isNotNewsDraft(d, patterns));
  const shown = pending.slice(0, SHOWN);
  const deletableIds = notNews.slice(0, MAX_DELETE).map((d) => d.id);

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
          <button className="btn-primary"><RefreshCw className="h-4 w-4" aria-hidden /> Внеси новини</button>
        </form>
      </div>

      {found !== undefined && !sp.error && (
        <div role="status" className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Готово. Намерени: {found} · нови чернови: <strong>{num(sp.created) ?? 0}</strong> ·
          пропуснати (вече ги има): {num(sp.skipped) ?? 0}
          {pendingAfter !== undefined && (
            <>
              {" "}· чакат преглед: <strong>{pendingAfter}</strong>
            </>
          )}
          .
          {withoutDate !== undefined && withoutDate > 0 && (
            <> Без дата (не са внесени): {withoutDate}.</>
          )}
        </div>
      )}
      {sp.error && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {sp.error}
          {!sp.error.includes("Провер") && " Проверете адреса на източника (MUNICIPALITY_NEWS_URL)."}
          {withoutDate !== undefined && withoutDate > 0 && (
            <> По шаблона, но без дата (не са внесени): {withoutDate}.</>
          )}
        </div>
      )}
      {removed !== undefined && (
        <div
          role="status"
          className={
            "rounded-lg px-4 py-2 text-sm " +
            (removed > 0 ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-700")
          }
        >
          {removed > 0
            ? `Изтрити записи, които не бяха новини: ${removed}.`
            : "Нищо не е изтрито — записите вече ги няма или са публикувани."}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Чакащи преглед ({pending.length})
        </h2>
        {pending.length > SHOWN && (
          <p className="mb-3 text-sm text-slate-600">Показани са най-новите {SHOWN}.</p>
        )}
        {shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            Няма внесени чернови. Натиснете „Внеси новини“.
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((d) => {
              const href = safeHref(d.sourceUrl);
              return (
                <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">{d.title}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {d.source}
                        {d.sourceDate ? " · " + dateFmt.format(d.sourceDate) : ""}
                      </div>
                      {d.excerpt && <p className="mt-1 text-sm text-slate-600">{d.excerpt}</p>}
                      {href && (
                        <a
                          href={href}
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
              );
            })}
          </div>
        )}
      </div>

      {notNews.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-slate-900">
            Не са новини — скрити от списъка ({notNews.length})
          </summary>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Внесени са от сайта на общината, но адресът им не е на отделна новина — най-често
            са страници от менюто (декларации, структура, правомощия). Не се показват в сайта
            и не са в „Чакащи преглед“, за да не бъдат публикувани по грешка.
          </p>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {notNews.map((d) => {
              const href = safeHref(d.sourceUrl);
              return (
                <li key={d.id} className="py-2">
                  <div className="text-slate-800">{d.title}</div>
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-xs text-brand-700 hover:underline"
                    >
                      ↗ {d.sourceUrl}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          {isAdmin ? (
            <div className="mt-3">
              <DeleteNotNewsButton
                action={deleteNotNewsDrafts.bind(null, deletableIds)}
                count={deletableIds.length}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              Окончателното изтриване е само за администратор.
            </p>
          )}
        </details>
      )}

      <p className="text-xs text-slate-600">
        Съвет: вносът може да тече автоматично по график на сървъра (виж DEPLOY.md,
        раздел 9). Публикуването винаги остава ръчно.
      </p>
    </div>
  );
}
