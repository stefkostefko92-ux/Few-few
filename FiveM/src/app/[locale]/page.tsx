import Link from 'next/link';

import { Mascot } from '@/components/Mascot';
import { ServerCard } from '@/components/ServerCard';
import { faqJsonLd, jsonLdString, pageMetadata, serverListJsonLd } from '@/lib/seo';
import { listPublicServers } from '@/lib/servers';

// Живият статус се мени постоянно — не се кешира между заявките.
export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  title: 'Български FiveM RP сървъри — жив списък със статус и играчи',
  description:
    'Всички български FiveM RP сървъри на едно място: онлайн статус, брой играчи, рамка (ESX, QBCore, Qbox), whitelist, Discord и правила. Обновява се автоматично.',
  path: '/',
  keywords: ['списък FiveM сървъри', 'FiveM сървъри онлайн', 'българско roleplay'],
});

/** „Отговор отпред“ — това е, което AI отговарачите цитират (AEO). */
const FAQ = [
  {
    question: 'Как да вляза в български FiveM RP сървър?',
    answer:
      'Нужно е легално копие на GTA V и инсталиран FiveM клиент от fivem.net. След това избираш сървър от списъка тук и натискаш „Влез“ — линкът cfx.re/join отваря клиента и те свързва директно.',
  },
  {
    question: 'Какво е ESX, QBCore и Qbox?',
    answer:
      'Това са рамките, върху които сървърът гради ролевата игра — работа, пари, инвентар, документи. ESX е най-старата и разпространена, QBCore е по-модерна, Qbox е неин форк с по-строга производителност. За играча разликата се усеща в менютата и в икономиката.',
  },
  {
    question: 'Какво значи whitelist сървър?',
    answer:
      'Whitelist сървърът приема нови играчи само след одобрение — обикновено кандидатстване в Discord с история на героя. Целта е по-сериозна ролева игра и по-малко нарушители.',
  },
  {
    question: 'Как да добавя своя сървър в списъка?',
    answer:
      'През формата „Добави сървър“. Заявката влиза в модераторска опашка и се публикува след ръчна проверка — така списъкът остава чист от мъртви и фалшиви сървъри.',
  },
];

export default async function HomePage() {
  const servers = await listPublicServers();
  const online = servers.filter((server) => server.online);
  const totalPlayers = online.reduce((sum, server) => sum + server.players, 0);

  return (
    <>
      <section className="flex flex-col-reverse items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Българските FiveM RP сървъри — на едно място
          </h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Жив списък със статуса на всеки сървър: онлайн ли е, колко души играят, на каква рамка
            върви и има ли whitelist. Данните се четат директно от самите сървъри.
          </p>
          {servers.length > 0 && (
            <p className="mt-4 text-sm text-slate-400">
              {online.length} онлайн от {servers.length} · {totalPlayers} играчи в момента
            </p>
          )}
        </div>

        {/* Герой-кадър: пълното ниво (градиенти, ореол, мехурчета) си струва само
            над 128 px. Погледът следи курсора, а анимацията мълчи при
            prefers-reduced-motion — и двете са вградени в компонента. */}
        <Mascot
          detail="full"
          size={168}
          pose="wave"
          expression="happy"
          gaze="follow"
          animated
          title={null}
          className="shrink-0"
        />
      </section>

      <nav aria-label="Филтри" className="mt-6 flex flex-wrap gap-2 text-sm">
        {[
          { href: '/servers/framework/esx', label: 'ESX' },
          { href: '/servers/framework/qbcore', label: 'QBCore' },
          { href: '/servers/framework/qbox', label: 'Qbox' },
          { href: '/servers/framework/ox_core', label: 'ox_core' },
          { href: '/servers/whitelist', label: 'Whitelist' },
        ].map((filter) => (
          <Link
            key={filter.href}
            href={filter.href}
            className="rounded-lg border border-white/15 px-3 py-1.5 hover:border-fivem-500 hover:text-fivem-400"
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      <section className="mt-10" aria-labelledby="servers-heading">
        <h2 id="servers-heading" className="sr-only">
          Списък със сървъри
        </h2>
        {servers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 p-6 text-slate-300">
            Списъкът още се пълни.{' '}
            <Link href="/submit" className="text-fivem-400 hover:underline">
              Добави своя сървър
            </Link>{' '}
            — заявките се преглеждат ръчно.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {servers.map((server) => (
              <ServerCard key={server.slug} server={server} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-14" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight">
          Чести въпроси
        </h2>
        <dl className="mt-6 space-y-6">
          {FAQ.map((item) => (
            <div key={item.question}>
              <dt className="font-medium">{item.question}</dt>
              <dd className="mt-1 text-slate-300">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(faqJsonLd(FAQ)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(serverListJsonLd(servers)) }}
      />
    </>
  );
}
