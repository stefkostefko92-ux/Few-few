import Link from 'next/link';

import { JsonLd } from '@/components/JsonLd';
import { ServerCard } from '@/components/ServerCard';
import { getDictionary, resolveLocale } from '@/i18n';
import { breadcrumbJsonLd, pageMetadata, serverListJsonLd } from '@/lib/seo';
import { listPublicServers } from '@/lib/servers';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

const COPY = {
  bg: {
    title: 'Whitelist FiveM сървъри в България',
    description:
      'Български FiveM RP сървъри с whitelist — приемат нови играчи само след одобрение. По-сериозна ролева игра и по-малко нарушители.',
    intro:
      'Whitelist сървърът приема нови играчи само след одобрение — обикновено кандидатстване в Discord с история на героя. Целта е по-сериозна ролева игра и по-малко нарушители.',
    empty: 'Още няма листнат whitelist сървър.',
    cta: 'Добави своя',
    keywords: ['whitelist FiveM сървър', 'сериозен RP сървър', 'heavy RP България'],
  },
  en: {
    title: 'Whitelisted FiveM servers in Bulgaria',
    description:
      'Bulgarian FiveM RP servers with a whitelist — new players are accepted only after approval. More serious roleplay and fewer rule breakers.',
    intro:
      'A whitelisted server accepts new players only after approval — usually an application in Discord with a character backstory. The point is more serious roleplay and fewer rule breakers.',
    empty: 'No whitelisted server listed yet.',
    cta: 'Add yours',
    keywords: ['whitelist FiveM server', 'serious RP server', 'heavy RP Bulgaria'],
  },
} as const;

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const copy = COPY[locale];
  return pageMetadata({
    locale,
    title: copy.title,
    description: copy.description,
    path: '/servers/whitelist',
    keywords: [...copy.keywords],
  });
}

export default async function WhitelistPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  const copy = COPY[locale];
  const servers = await listPublicServers({ whitelist: true });

  return (
    <div>
      <nav aria-label={t.common.breadcrumbLabel} className="text-sm text-silver-500">
        <Link href={`/${locale}`} className="underline underline-offset-2 hover:text-cyan-300">
          {t.server.breadcrumb}
        </Link>{' '}
        / <span aria-current="page">{t.filters.whitelist}</span>
      </nav>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        <span className="text-chrome">{copy.title}</span>
      </h1>
      <p className="mt-3 max-w-2xl text-silver-400">{copy.intro}</p>

      {servers.length === 0 ? (
        <p className="mt-8 text-silver-400">
          {copy.empty}{' '}
          <Link href={`/${locale}/submit`} className="text-cyan-300 underline underline-offset-2">
            {copy.cta}
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <ServerCard key={server.slug} server={server} locale={locale} t={t} />
          ))}
        </ul>
      )}

      <JsonLd data={serverListJsonLd(locale, servers)} />
      <JsonLd data={breadcrumbJsonLd(locale, [
              { name: t.server.breadcrumb, path: '/' },
              { name: t.filters.whitelist, path: '/servers/whitelist' },
            ])} />
    </div>
  );
}
