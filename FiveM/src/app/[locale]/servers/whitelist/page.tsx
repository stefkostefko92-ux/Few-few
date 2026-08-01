import Link from 'next/link';

import { ServerCard } from '@/components/ServerCard';
import { breadcrumbJsonLd, jsonLdString, pageMetadata, serverListJsonLd } from '@/lib/seo';
import { listPublicServers } from '@/lib/servers';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  title: 'Whitelist FiveM сървъри в България',
  description:
    'Български FiveM RP сървъри с whitelist — приемат нови играчи само след одобрение. По-сериозна ролева игра и по-малко нарушители.',
  path: '/servers/whitelist',
  keywords: ['whitelist FiveM сървър', 'сериозен RP сървър', 'heavy RP България'],
});

export default async function WhitelistPage() {
  const servers = await listPublicServers({ whitelist: true });

  return (
    <div>
      <nav aria-label="Пътека" className="text-sm text-slate-400">
        <Link href="/" className="hover:text-fivem-400">
          Сървъри
        </Link>{' '}
        / <span aria-current="page">Whitelist</span>
      </nav>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Whitelist FiveM сървъри в България
      </h1>
      <p className="mt-3 max-w-2xl text-slate-300">
        Whitelist сървърът приема нови играчи само след одобрение — обикновено кандидатстване в
        Discord с история на героя. Целта е по-сериозна ролева игра и по-малко нарушители.
      </p>

      {servers.length === 0 ? (
        <p className="mt-8 text-slate-300">
          Още няма листнат whitelist сървър.{' '}
          <Link href="/submit" className="text-fivem-400 hover:underline">
            Добави своя
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {servers.map((server) => (
            <ServerCard key={server.slug} server={server} />
          ))}
        </ul>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(serverListJsonLd(servers)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbJsonLd([
              { name: 'Сървъри', path: '/' },
              { name: 'Whitelist', path: '/servers/whitelist' },
            ]),
          ),
        }}
      />
    </div>
  );
}
