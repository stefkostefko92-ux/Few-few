import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ServerCard } from '@/components/ServerCard';
import { FRAMEWORK_LABEL, type FrameworkId } from '@/lib/fivem';
import { breadcrumbJsonLd, jsonLdString, pageMetadata, serverListJsonLd } from '@/lib/seo';
import { listPublicServers } from '@/lib/servers';

export const dynamic = 'force-dynamic';

/** Само рамките, които реално се търсят — UNKNOWN няма своя страница. */
const FILTERS = {
  esx: {
    id: 'ESX' as const,
    title: 'ESX сървъри в България',
    intro:
      'ESX е най-разпространената рамка за FiveM roleplay — работа, пари, инвентар и документи. Ето българските сървъри, които вървят на нея.',
  },
  qbcore: {
    id: 'QBCORE' as const,
    title: 'QBCore сървъри в България',
    intro:
      'QBCore е по-модерната алтернатива на ESX, с по-подредена структура и активна екосистема от скриптове. Българските сървъри на QBCore са тук.',
  },
  qbox: {
    id: 'QBOX' as const,
    title: 'Qbox сървъри в България',
    intro:
      'Qbox е форк на QBCore с фокус върху производителността. Списък с българските сървъри, които са минали на него.',
  },
  ox_core: {
    id: 'OX_CORE' as const,
    title: 'ox_core сървъри в България',
    intro:
      'ox_core е лека, модерна рамка от екипа зад ox_lib и oxmysql. Ето кои български сървъри я ползват.',
  },
} satisfies Record<string, { id: FrameworkId; title: string; intro: string }>;

type Params = { params: Promise<{ framework: string }> };

// Нарочно БЕЗ generateStaticParams: с него Next пререндира страницата на билд
// (при празна база → празен списък завинаги), а тук трябва жив статус.

export async function generateMetadata({ params }: Params) {
  const { framework } = await params;
  const filter = FILTERS[framework as keyof typeof FILTERS];
  if (!filter) return pageMetadata({ title: 'Не е намерено', description: '', noindex: true });

  return pageMetadata({
    title: filter.title,
    description: filter.intro,
    path: `/servers/framework/${framework}`,
    keywords: [`${FRAMEWORK_LABEL[filter.id]} сървъри`, `FiveM ${FRAMEWORK_LABEL[filter.id]}`],
  });
}

export default async function FrameworkPage({ params }: Params) {
  const { framework } = await params;
  const filter = FILTERS[framework as keyof typeof FILTERS];
  if (!filter) notFound();

  const servers = await listPublicServers({ framework: filter.id });

  return (
    <div>
      <nav aria-label="Пътека" className="text-sm text-slate-400">
        <Link href="/" className="hover:text-fivem-400">
          Сървъри
        </Link>{' '}
        / <span aria-current="page">{FRAMEWORK_LABEL[filter.id]}</span>
      </nav>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{filter.title}</h1>
      <p className="mt-3 max-w-2xl text-slate-300">{filter.intro}</p>

      {servers.length === 0 ? (
        <p className="mt-8 text-slate-300">
          Още няма листнат сървър на тази рамка.{' '}
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
              { name: FRAMEWORK_LABEL[filter.id], path: `/servers/framework/${framework}` },
            ]),
          ),
        }}
      />
    </div>
  );
}
