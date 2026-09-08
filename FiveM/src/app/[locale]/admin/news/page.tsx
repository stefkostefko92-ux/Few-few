import { resolveLocale } from '@/i18n';

import { deletePostAction, publishPostAction, savePostAction } from '@/app/actions/admin';
import { Badge } from '@/components/Badge';
import { requireAdminPage } from '@/lib/admin/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const input = 'w-full rounded border border-white/15 bg-ink-900 px-2 py-1 text-sm text-silver-100';
const button = 'rounded border border-white/15 px-3 py-1 text-sm hover:border-cyan-500';

function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 16).replace('T', ' ') : '—';
}

export default async function AdminNews({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  await requireAdminPage(locale);

  const posts = await prisma.post.findMany({
    // Черновите са най-отгоре: те са недовършената работа.
    orderBy: [{ publishedAt: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });
  const drafts = posts.filter((post) => post.publishedAt === null).length;

  return (
    <div>
      <p className="rounded-lg border border-cyan-700/40 bg-cyan-900/10 p-4 text-sm text-silver-300">
        Новината се създава като <strong>чернова</strong> и излиза публично чак с „Публикувай“ —
        нищо не става видимо от само себе си. Езикът има значение: текст на български, обявен като
        английски, кара sitemap-а да лъже търсачките, че има превод.
      </p>

      {/* ── Нова новина ─────────────────────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Badge name="news" size={28} /> Нова новина
        </h2>

        <form action={savePostAction} className="mt-3 grid gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-2">
          <label className="text-sm">
            Заглавие
            <input name="title" required minLength={3} maxLength={160} className={input} />
          </label>
          <label className="text-sm">
            Адрес (slug) — празно значи „от заглавието“
            <input name="slug" maxLength={80} placeholder="kak-se-vliza-v-survur" className={input} />
          </label>
          <label className="text-sm">
            Език
            <select name="postLocale" defaultValue="bg" className={input}>
              <option value="bg">български</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="text-sm">
            Автор
            <input name="author" defaultValue="Екипът на FiveM Bulgaria" maxLength={80} className={input} />
          </label>
          <label className="text-sm sm:col-span-2">
            Кратко описание (показва се в списъка и в OG)
            <textarea name="excerpt" required minLength={10} maxLength={400} rows={2} className={input} />
          </label>
          <label className="text-sm sm:col-span-2">
            Текст — обикновен текст, празен ред разделя абзаците. HTML не се изпълнява.
            <textarea name="body" required minLength={20} rows={10} className={input} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className={button}>
              Запази като чернова
            </button>
          </div>
        </form>
      </section>

      {/* ── Съществуващите ──────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          Новини ({posts.length}) · чернови: {drafts}
        </h2>

        {posts.length === 0 ? (
          <p className="mt-3 text-sm text-silver-500">Още няма нито една новина.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {posts.map((post) => (
              <li key={post.id} className="rounded-xl border border-white/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{post.title}</p>
                    <p className="mt-0.5 text-xs text-silver-500">
                      /{post.locale}/news/{post.slug} · {post.author} ·{' '}
                      {post.publishedAt ? `публикувана ${formatDate(post.publishedAt)}` : 'чернова'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={publishPostAction}>
                      <input type="hidden" name="id" value={post.id} />
                      <input type="hidden" name="publish" value={post.publishedAt ? '0' : '1'} />
                      <button type="submit" className={button}>
                        {post.publishedAt ? 'Свали от публично' : 'Публикувай'}
                      </button>
                    </form>
                    <form action={deletePostAction}>
                      <input type="hidden" name="id" value={post.id} />
                      <button type="submit" className={button}>
                        Изтрий
                      </button>
                    </form>
                  </div>
                </div>

                {/* Редакцията е същото действие като създаването — една форма,
                    един път за запис. `id` е разликата. */}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-cyan-300">Редактирай</summary>
                  <form action={savePostAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={post.id} />
                    <label className="text-sm">
                      Заглавие
                      <input name="title" defaultValue={post.title} required className={input} />
                    </label>
                    <label className="text-sm">
                      Адрес (slug)
                      <input name="slug" defaultValue={post.slug} className={input} />
                    </label>
                    <label className="text-sm">
                      Език
                      <select name="postLocale" defaultValue={post.locale} className={input}>
                        <option value="bg">български</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      Автор
                      <input name="author" defaultValue={post.author} className={input} />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      Кратко описание
                      <textarea name="excerpt" defaultValue={post.excerpt} rows={2} className={input} />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      Текст
                      <textarea name="body" defaultValue={post.body} rows={10} className={input} />
                    </label>
                    <div className="sm:col-span-2">
                      <button type="submit" className={button}>
                        Запази промените
                      </button>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
