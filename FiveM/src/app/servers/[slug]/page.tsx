import Link from 'next/link';
import { notFound } from 'next/navigation';

import { submitReviewAction } from '@/app/actions/review';
import { cfxJoinUrl, FRAMEWORK_LABEL, formatPlayers, type FrameworkId } from '@/lib/fivem';
import { errorMessage } from '@/lib/messages';
import { absoluteUrl, breadcrumbJsonLd, jsonLdString, pageMetadata } from '@/lib/seo';
import { getPublicServer, isFeatured, REVIEWS_SHOWN, reviewSummary } from '@/lib/servers';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ review?: string; error?: string }>;
};

export async function generateMetadata({ params }: Pick<Params, 'params'>) {
  const { slug } = await params;
  const server = await getPublicServer(slug);
  if (!server) return pageMetadata({ title: 'Сървърът не е намерен', description: '', noindex: true });

  return pageMetadata({
    title: `${server.name} — FiveM RP сървър`,
    description:
      server.tagline ??
      `${server.name}: български FiveM roleplay сървър на ${FRAMEWORK_LABEL[server.framework as FrameworkId]}. Статус, играчи, правила и Discord.`,
    path: `/servers/${server.slug}`,
    keywords: [server.name, `${server.name} FiveM`],
  });
}

export default async function ServerPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { review, error } = await searchParams;
  const server = await getPublicServer(slug);
  if (!server) notFound();

  const summary = await reviewSummary(server.id);
  const joinUrl = server.cfxJoinCode ? cfxJoinUrl(server.cfxJoinCode) : null;
  const featured = isFeatured(server);
  const message = errorMessage(error);

  // ВНИМАНИЕ: тук НЯМА `aggregateRating`. Оценките са от анонимни, непроверени
  // ревюта — издаването им към търсачките и AI отговарачите като структуриран
  // рейтинг е твърдение, което не можем да подкрепим (чл. 7, пар. 6 от Дир.
  // 2005/29/ЕО иска да се каже дали и как проверяваме отзивите). Схемата се
  // добавя чак когато има реална проверка на автора.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: server.name,
    url: absoluteUrl(`/servers/${server.slug}`),
    description: server.tagline ?? undefined,
  };

  return (
    <article>
      <nav aria-label="Пътека" className="text-sm text-slate-400">
        <Link href="/" className="underline underline-offset-2 hover:text-fivem-400">
          Сървъри
        </Link>{' '}
        / <span aria-current="page">{server.name}</span>
      </nav>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{server.name}</h1>
        {featured && (
          <span className="rounded bg-fivem-600/20 px-2 py-0.5 text-xs text-fivem-400">
            промотиран (платено)
          </span>
        )}
      </div>
      {server.tagline && <p className="mt-2 text-slate-300">{server.tagline}</p>}

      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-400">Статус</dt>
          <dd>
            {formatPlayers({
              outcome: server.lastProbe,
              players: server.players,
              maxPlayers: server.maxPlayers,
            })}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Рамка</dt>
          <dd>{FRAMEWORK_LABEL[server.framework as FrameworkId]}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Достъп</dt>
          <dd>{server.whitelist ? 'whitelist (с одобрение)' : 'свободен вход'}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Оценка</dt>
          <dd>
            {summary.average === null
              ? 'още няма ревюта'
              : `${summary.average} / 5 от ${summary.count} ревюта`}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-slate-400">
        Оценките са мнения на посетители. Не проверяваме дали авторът наистина е играл на сървъра;
        публикуваме след ръчен преглед и махаме очевидно фалшивите. Не приемаме плащане за оценка.
      </p>

      {server.lastProbe === 'HIDDEN' && (
        <p className="mt-4 rounded-lg border border-white/10 bg-fivem-900/60 p-3 text-sm text-slate-300">
          Собственикът е скрил публичния статус на сървъра (<code>sv_requestParanoia</code>). Това не
          означава, че сървърът е офлайн — просто не можем да четем броя играчи.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {joinUrl && (
          <a
            href={joinUrl}
            rel="nofollow noopener"
            className="rounded-lg bg-fivem-500 px-4 py-2 font-medium text-fivem-950 hover:bg-fivem-400"
          >
            Влез в сървъра
          </a>
        )}
        {server.discordUrl && (
          <a
            href={server.discordUrl}
            rel="nofollow noopener ugc"
            className="rounded-lg border border-white/15 px-4 py-2 hover:border-fivem-500"
          >
            Discord
          </a>
        )}
        {server.websiteUrl && (
          <a
            href={server.websiteUrl}
            rel="nofollow noopener ugc"
            className="rounded-lg border border-white/15 px-4 py-2 hover:border-fivem-500"
          >
            Сайт
          </a>
        )}
      </div>

      {server.description && (
        <section className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">За сървъра</h2>
            <Link
              href={`/report?url=${encodeURIComponent(absoluteUrl(`/servers/${server.slug}`))}`}
              className="text-sm text-slate-400 underline underline-offset-2 hover:text-fivem-400"
            >
              ⚑ Сигнал за това съдържание
            </Link>
          </div>
          {/* Текстът е подаден от собственика — рендира се като ЧИСТ ТЕКСТ, без HTML/Markdown. */}
          <p className="mt-3 whitespace-pre-line text-slate-300">{server.description}</p>
        </section>
      )}

      <section className="mt-10" id="ревю">
        <h2 className="text-xl font-semibold">Ревюта</h2>

        {review === 'ok' && (
          <p role="status" className="mt-3 rounded-lg border border-fivem-600 bg-fivem-900 p-3">
            Благодарим. Ревюто влиза в опашка за преглед и се публикува след одобрение.
          </p>
        )}
        {message && (
          <p role="alert" className="mt-3 rounded-lg border border-red-500/60 bg-red-950/40 p-3">
            {message}
          </p>
        )}

        {server.reviews.length === 0 ? (
          <p className="mt-3 text-slate-300">Още няма одобрени ревюта за този сървър.</p>
        ) : (
          <>
            <ul className="mt-4 space-y-4">
              {server.reviews.map((item) => (
                <li key={item.id} className="rounded-lg border border-white/10 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm text-slate-400">
                      {item.rating} / 5 · {item.authorAlias ?? 'анонимен'}
                    </p>
                    <Link
                      href={`/report?url=${encodeURIComponent(absoluteUrl(`/servers/${server.slug}#ревю`))}`}
                      className="text-xs text-slate-400 underline underline-offset-2 hover:text-fivem-400"
                    >
                      ⚑ Сигнал
                    </Link>
                  </div>
                  {item.body && <p className="mt-2 whitespace-pre-line text-slate-200">{item.body}</p>}
                </li>
              ))}
            </ul>
            {summary.count > REVIEWS_SHOWN && (
              <p className="mt-3 text-sm text-slate-400">
                Показваме последните {REVIEWS_SHOWN} от общо {summary.count}.
              </p>
            )}
          </>
        )}

        <form action={submitReviewAction} className="mt-8 max-w-md space-y-4">
          <h3 className="font-medium">Остави ревю</h3>
          <input type="hidden" name="slug" value={server.slug} />

          <div>
            <label htmlFor="rating">Оценка (1–5)</label>
            <select
              id="rating"
              name="rating"
              defaultValue="5"
              className="mt-1 w-full rounded-lg border border-white/15 bg-fivem-900 px-3 py-2 text-slate-100"
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="authorAlias">Псевдоним (по избор)</label>
            <input
              id="authorAlias"
              name="authorAlias"
              maxLength={40}
              className="mt-1 w-full rounded-lg border border-white/15 bg-fivem-900 px-3 py-2 text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="body">Мнение</label>
            <textarea
              id="body"
              name="body"
              rows={4}
              maxLength={2000}
              className="mt-1 w-full rounded-lg border border-white/15 bg-fivem-900 px-3 py-2 text-slate-100"
              aria-describedby="review-help"
            />
            <p id="review-help" className="mt-1 text-sm text-slate-400">
              Не искаме и не пазим име, имейл или IP адрес. Не публикувай лични данни на други хора.
              Ревюто се преглежда ръчно преди публикуване — виж{' '}
              <Link href="/terms" className="text-fivem-400 underline underline-offset-2">
                Общите условия
              </Link>
              .
            </p>
          </div>

          {/* Honeypot — скрит за хора, видим за ботове. */}
          <div aria-hidden="true" className="hidden">
            <label htmlFor="website">Не попълвай това поле</label>
            <input id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          <button
            type="submit"
            className="rounded-lg border border-white/15 px-4 py-2 hover:border-fivem-500"
          >
            Изпрати ревюто
          </button>
        </form>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbJsonLd([
              { name: 'Сървъри', path: '/' },
              { name: server.name, path: `/servers/${server.slug}` },
            ]),
          ),
        }}
      />
    </article>
  );
}
