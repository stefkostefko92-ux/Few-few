import Link from 'next/link';
import { notFound } from 'next/navigation';

import { cfxJoinUrl, FRAMEWORK_LABEL, formatPlayers, type FrameworkId } from '@/lib/fivem';
import { absoluteUrl, breadcrumbJsonLd, jsonLdString, pageMetadata } from '@/lib/seo';
import { averageRating, getPublicServer } from '@/lib/servers';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
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

export default async function ServerPage({ params }: Params) {
  const { slug } = await params;
  const server = await getPublicServer(slug);
  if (!server) notFound();

  const rating = averageRating(server.reviews);
  const joinUrl = server.cfxJoinCode ? cfxJoinUrl(server.cfxJoinCode) : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: server.name,
    url: absoluteUrl(`/servers/${server.slug}`),
    description: server.tagline ?? undefined,
    ...(rating !== null && server.reviews.length > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: rating,
            reviewCount: server.reviews.length,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  return (
    <article>
      <nav aria-label="Пътека" className="text-sm text-slate-400">
        <Link href="/" className="hover:text-fivem-400">
          Сървъри
        </Link>{' '}
        / <span aria-current="page">{server.name}</span>
      </nav>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{server.name}</h1>
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
          <dd>{rating === null ? 'още няма ревюта' : `${rating} / 5 от ${server.reviews.length}`}</dd>
        </div>
      </dl>

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
          <h2 className="text-xl font-semibold">За сървъра</h2>
          {/* Текстът е подаден от собственика — рендира се като ЧИСТ ТЕКСТ, без HTML/Markdown. */}
          <p className="mt-3 whitespace-pre-line text-slate-300">{server.description}</p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Ревюта</h2>
        {server.reviews.length === 0 ? (
          <p className="mt-3 text-slate-300">Още няма одобрени ревюта за този сървър.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {server.reviews.map((review) => (
              <li key={review.id} className="rounded-lg border border-white/10 p-4">
                <p className="text-sm text-slate-400">
                  {review.rating} / 5 · {review.authorAlias ?? 'анонимен'}
                </p>
                {review.body && <p className="mt-2 whitespace-pre-line text-slate-200">{review.body}</p>}
              </li>
            ))}
          </ul>
        )}
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
