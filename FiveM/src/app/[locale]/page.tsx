import { existsSync } from 'node:fs';
import path from 'node:path';

import Image from 'next/image';
import Link from 'next/link';

import { JsonLd } from '@/components/JsonLd';
import { Icon } from '@/components/Icon';
import { ServerRow } from '@/components/ServerRow';
import { getContent } from '@/content';
import { getDictionary, resolveLocale } from '@/i18n';
import { type Locale } from '@/i18n/config';
import { prisma } from '@/lib/db';
import { faqJsonLd, pageMetadata, serverListJsonLd } from '@/lib/seo';
import { listPublicServers } from '@/lib/servers';
import { streamerCounts } from '@/lib/streamers-db';
import { DISCORD_INVITE } from '@/lib/site';

// Живият статус се мени постоянно — не се кешира между заявките.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

/**
 * Снимката на героя е ПО ЖЕЛАНИЕ и се пуска само ако файлът наистина е там.
 *
 * Причината да се проверява, вместо да се зашие: `next/image` към липсващ файл
 * дава счупен кадър и 404 на всяка заявка към началната. Така снимката е
 * drop-in — слагаш файла, тя излиза; махаш го, героят пада обратно на
 * градиента. Същият подход като `Icon`/`Badge`, които и днес четат от диска.
 *
 * ВНИМАНИЕ ЗА ПРАВАТА: тук НЕ върви кадър от GTA V или FiveM. Те са
 * интелектуална собственост на Take-Two/Rockstar, а сайтът изрично обявява, че
 * не е свързан с тях — снимка от играта прави точно обратното твърдение.
 */
const HERO_CANDIDATES = ['hero.webp', 'hero.jpg', 'hero.png'];

function findHero(): string | null {
  for (const file of HERO_CANDIDATES) {
    if (existsSync(path.join(process.cwd(), 'public', 'brand', file))) return `/brand/${file}`;
  }
  return null;
}

/** Колко сървъра показва класацията. Landing, не каталог — пълният е на /servers. */
const TEASER = 6;
const NEWS_TEASER = 3;

/**
 * Излизане от контейнера до ръба на екрана.
 *
 * `main` е `max-w-6xl` с `px-4`, значи процентният margin се смята спрямо
 * СЪДЪРЖИМАТА му ширина: `50% - 50vw` дава точно отместването до ръба, при
 * всяка ширина. Скролбарът прави `100vw` малко по-широк от видимото — затова
 * ОБВИВКАТА на `main` в layout.tsx носи `overflow-x-clip`. Не самият `main`:
 * той е 1152 px и клип върху него режеше героя до толкова на широк екран
 * (първата версия правеше точно това и мереше само до 1280 px, където
 * дефектът е почти невидим).
 */
const FULL_BLEED = 'mx-[calc(50%-50vw)] w-screen';

/**
 * „Отговор отпред“ за AI отговарачите (AEO): въпросите се хранят от СЪЩИТЕ
 * правила и туториали, които сайтът показва — не се пишат втори път, значи не
 * могат да се разминат с тях.
 */
function faqFor(locale: Locale) {
  const content = getContent(locale);
  const rp = content.rules.find((section) => section.id === 'roleplay');
  const pick = (id: string) => rp?.items.find((item) => item.id === id);
  const join = content.tutorials.find((tutorial) => tutorial.id === 'join');
  const frameworks = content.tutorials.find((tutorial) => tutorial.id === 'frameworks');

  const entries = [
    join && { question: join.title, answer: join.steps[0].body },
    frameworks && {
      question: frameworks.title,
      answer: frameworks.steps.map((step) => `${step.title}: ${step.body}`).join(' '),
    },
    pick('nlr') && { question: pick('nlr')!.title, answer: pick('nlr')!.body },
    pick('rdm') && { question: pick('rdm')!.title, answer: pick('rdm')!.body },
  ];

  return entries.filter((item): item is { question: string; answer: string } => Boolean(item));
}

/** Последните публикувани новини. Празно при празна база — не вали страницата. */
async function latestNews(locale: Locale) {
  try {
    return await prisma.post.findMany({
      where: { locale, publishedAt: { not: null, lte: new Date() } },
      select: { slug: true, title: true, excerpt: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: NEWS_TEASER,
    });
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.home.title,
    description: t.home.description,
    path: '/',
    // Началната има СВОИ ключови думи. Досега трите страници (начална,
    // правила, туториали) споделяха едно множество и се състезаваха за едни и
    // същи запитвания — сами си правехме канибализация в резултатите.
    //
    // Нито една дума тук НЕ бива да повтаря `BASE_KEYWORDS` — сливането в
    // `pageMetadata` така или иначе маха дубъла, тоест повторението не добавя
    // нищо, а само изяжда едно от местата. „български FiveM сървъри“ стоеше
    // тук и точно това правеше: четири думи, три нови.
    keywords:
      locale === 'bg'
        ? [
            'къде да играя FiveM в България',
            'FiveM roleplay България',
            'GTA V RP сървъри',
            'FiveM BG общност',
          ]
        : [
            'where to play FiveM in Bulgaria',
            'FiveM roleplay Bulgaria',
            'GTA V RP servers',
            'FiveM BG community',
          ],
  });
}

export default async function HomePage({ params }: Props) {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = getDictionary(locale);

  // Всичко наведнъж: три независими четения не бива да чакат едно друго.
  const [servers, streamers, news] = await Promise.all([
    listPublicServers(),
    streamerCounts(),
    latestNews(locale),
  ]);

  const online = servers.filter((server) => server.online);
  const totalPlayers = online.reduce((sum, server) => sum + server.players, 0);
  const featured = servers.slice(0, TEASER);
  const faq = faqFor(locale);
  const heroImage = findHero();

  const stats = [
    { value: servers.length, label: t.home.statServers, accent: false },
    { value: online.length, label: t.home.statOnline, accent: true },
    { value: totalPlayers, label: t.home.statPlayers, accent: true },
    { value: streamers.live, label: t.home.statStreamers, accent: false },
  ];

  const why = [
    { title: t.home.whyLiveTitle, body: t.home.whyLiveBody },
    { title: t.home.whyFilterTitle, body: t.home.whyFilterBody },
    { title: t.home.whyHonestTitle, body: t.home.whyHonestBody },
  ];

  const steps = [
    { icon: 'search', title: t.home.stepFindTitle, body: t.home.stepFindBody },
    { icon: 'info', title: t.home.stepCheckTitle, body: t.home.stepCheckBody },
    { icon: 'join', title: t.home.stepJoinTitle, body: t.home.stepJoinBody },
  ];

  return (
    <>
      {/* ── Герой: плакат + живото табло ─────────────────────────────────── */}
      {/* Отрицателният горен отстъп изяжда отстъпа на `main`, за да няма ивица
          фон между хедъра и кадъра — плакатът започва от самия хедър. */}
      {/* `isolate` е задължителен: слоевете на фона са `-z-10`, а `body::before`
          (атмосферата) е фиксиран на `z-index: -1`. Без собствен контекст на
          подреждане снимката пада ПОД атмосферата и изчезва — точно това се
          случи при първата проба. */}
      <section className={`relative isolate -mt-10 overflow-hidden sm:-mt-14 ${FULL_BLEED}`}>
        {heroImage ? (
          <>
            {/* Снимката е ФОН, не съдържание → `alt=""` и `aria-hidden`.
                `priority` е задължителен: това е LCP елементът. */}
            <Image
              src={heroImage}
              alt=""
              aria-hidden="true"
              fill
              priority
              sizes="100vw"
              className="pointer-events-none absolute inset-0 -z-10 object-cover object-bottom opacity-90"
            />
            {/* ДВЕ затъмнения, не едно, и това не е вкус. Вертикалното слива
                долния ръб на кадъра с фона на страницата — иначе плакатът
                свършва с видима хоризонтална черта. Хоризонталното пази
                контраста ТАМ, КЪДЕТО СТОИ ТЕКСТЪТ — вляво: над произволен кадър
                `silver-300` иначе пада под 4,5:1 (1.4.3). */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-ink-950/60 via-transparent via-60% to-ink-950"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-ink-950/90 via-ink-950/35 to-transparent"
            />
          </>
        ) : null}
        {/* Цианов ореол зад таблото — „светлината на града“. Нула байта. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(45%_55%_at_78%_45%,rgba(32,168,192,0.20),transparent_70%)]"
        />

        <div className="mx-auto grid max-w-site items-center gap-12 px-4 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-24 lg:min-h-[44rem] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:pb-24">
          <div className="flex gap-5 sm:gap-7">
            {/* Трикольорът като НОСЕЩА греда, не като кант отгоре. */}
            <div className="flag-rule w-1.5 shrink-0 rounded-full shadow-[0_0_24px_rgba(255,255,255,0.12)]" aria-hidden="true" />

            <div className="min-w-0">
              {/* Без етикет с разредени главни над заглавието: той повтаряше
                  водещия абзац и е най-честият белег на шаблонна страница. */}
              <h1 className="font-display text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.04em] sm:text-[4.25rem] lg:text-[3.75rem] xl:text-[5.25rem]">
                <span className="text-chrome">{t.home.h1}</span>
              </h1>
              <p className="lead mt-7">{t.home.intro}</p>

              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Link href={`/${locale}/servers`} className="btn-primary btn-lg">
                  {t.home.ctaBrowse}
                </Link>
                <p className="text-silver-400">
                  {t.home.ctaOr}{' '}
                  {/* Отделен ключ, а не `ctaSubmit.toLowerCase()`: смяната на
                      регистър по време на изпълнение е правило за ЕЗИК, не за
                      низ, и се чупи тихо. */}
                  <Link href={`/${locale}/submit`} className="link">
                    {t.home.ctaSubmitInline}
                  </Link>
                </p>
              </div>

              {/* ── Живите числа ─────────────────────────────────────────── */}
              {servers.length > 0 && (
                <dl className="mt-12 grid max-w-xl grid-cols-2 gap-y-6 sm:grid-cols-4">
                  {/* `dt` стои ПРЕДИ `dd` в кода, защото HTML иска точно този ред
                      вътре в `div` на `dl`; визуално етикетът е подпис ПОД
                      числото — `flex-col-reverse`, не разместване на маркъпа. */}
                  {stats.map((stat, index) => (
                    <div
                      key={stat.label}
                      className={`flex flex-col-reverse ${index % 2 === 1 ? 'border-s border-white/[0.08] ps-5' : ''} ${index > 0 ? 'sm:border-s sm:border-white/[0.08] sm:ps-5' : ''}`}
                    >
                      <dt className="mt-1.5 text-sm text-silver-400">{stat.label}</dt>
                      <dd
                        className={`font-display text-[2rem] font-medium leading-none tabular-nums tracking-[-0.03em] sm:text-[2.25rem] ${
                          stat.accent ? 'text-cyan-300' : 'text-silver-100'
                        }`}
                      >
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>

          {/* ── Живото табло (класацията) ──────────────────────────────────── */}
          {featured.length > 0 ? (
            <section aria-labelledby="teaser-heading" className="panel-chrome overflow-hidden">
              <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4 sm:px-5">
                <h2
                  id="teaser-heading"
                  className="flex items-center gap-3 font-display text-[0.9375rem] font-semibold tracking-[-0.01em] text-silver-100 sm:text-lg"
                >
                  {online.length > 0 ? <span className="live-dot" aria-hidden="true" /> : <span className="idle-dot" aria-hidden="true" />}
                  {t.home.teaserHeading}
                </h2>
                <Link href={`/${locale}/servers`} className="link-quiet inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-sm">
                  {t.home.teaserAll} ({servers.length})
                </Link>
              </div>

              <ol>
                {featured.map((server, index) => (
                  <ServerRow key={server.slug} server={server} locale={locale} t={t} rank={index + 1} />
                ))}
              </ol>

              {/* Тук СЪЩО има класирани резултати (промотираните са първи), значи
                  разкритието по чл. 7, ал. 4а от Дир. 2005/29/ЕО трябва да е и тук,
                  не само на /servers — и то ДО резултатите, не някъде по-долу. */}
              <p className="border-t border-white/[0.07] px-4 py-3.5 text-xs sm:px-5">
                <Link href={`/${locale}/terms#kak-podrezhdame-sarvarite`} className="link-quiet">
                  {t.home.rankingLink}
                </Link>
              </p>
            </section>
          ) : (
            <section className="panel p-6 text-silver-300">
              {t.home.emptyLead}{' '}
              <Link href={`/${locale}/submit`} className="link">
                {t.home.emptyCta}
              </Link>{' '}
              {t.home.emptyTail}
            </section>
          )}
        </div>
      </section>

      {/* ── Защо тук ─────────────────────────────────────────────────────── */}
      <section className="mt-6" aria-labelledby="why-heading">
        <h2 id="why-heading" className="sr-only">
          {t.home.whyHeading}
        </h2>
        <ul className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-3">
          {why.map((item) => (
            <li key={item.title} className="bg-ink-950 p-6 sm:p-8">
              <div className="h-[3px] w-10 rounded-full bg-gradient-to-r from-cyan-300 to-cyan-600" aria-hidden="true" />
              <h3 className="mt-5 font-display text-lg font-semibold leading-snug tracking-[-0.015em] text-silver-100">
                {item.title}
              </h3>
              <p className="mt-3 leading-relaxed text-silver-400">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Как работи ───────────────────────────────────────────────────── */}
      <section className="mt-24" aria-labelledby="how-heading">
        <h2 id="how-heading" className="section-title">
          {t.home.howHeading}
        </h2>
        <ol className="relative mt-10 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {/* Нишката между стъпките — само на широк екран, където са в ред. */}
          <span
            aria-hidden="true"
            className="absolute start-6 end-6 top-6 hidden h-px bg-gradient-to-r from-cyan-400/50 via-white/10 to-transparent sm:block"
          />
          {steps.map((step, index) => (
            <li key={step.title} className="relative">
              {/* Номерът тук Е информация (стъпките са последователност), значи
                  се вижда — за разлика от декоративните маркери другаде. */}
              <span className="relative flex size-12 items-center justify-center rounded-full border border-cyan-300/30 bg-ink-950 font-display text-lg font-semibold tabular-nums text-cyan-300 shadow-[0_0_30px_-6px_rgba(60,204,228,0.6)]">
                {index + 1}
              </span>
              <h3 className="mt-5 flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.015em] text-silver-100">
                <Icon group="ui" name={step.icon} size={18} />
                {step.title}
              </h3>
              <p className="mt-2 leading-relaxed text-silver-400">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Стриймъри + Discord ──────────────────────────────────────────── */}
      <section className="mt-24 grid gap-4 lg:grid-cols-2">
        {streamers.total > 0 && (
          <div className="panel flex flex-col justify-between gap-6 p-6 sm:p-8">
            <div>
              <h2 className="flex items-center gap-3 font-display text-xl font-semibold tracking-[-0.015em] text-silver-100">
                {streamers.live > 0 ? <span className="live-dot" aria-hidden="true" /> : <span className="idle-dot" aria-hidden="true" />}
                {t.home.streamersHeading}
              </h2>
              <p className="mt-2 text-silver-400">
                {streamers.live > 0 ? `${streamers.live} ${t.home.streamersLive}` : t.home.streamersNone}
              </p>
            </div>
            <Link href={`/${locale}/streamers`} className="btn-ghost self-start">
              {t.home.streamersCta}
            </Link>
          </div>
        )}
        <div className={`panel flex flex-col justify-between gap-6 p-6 sm:p-8 ${streamers.total > 0 ? '' : 'lg:col-span-2'}`}>
          <p className="font-display text-xl font-semibold leading-snug tracking-[-0.015em] text-silver-100">
            {t.home.discordLead}
          </p>
          <a href={DISCORD_INVITE} rel="noopener nofollow" className="btn-primary self-start">
            <Icon group="brand" name="discord" size={18} />
            {t.home.discordCta}
          </a>
        </div>
      </section>

      {/* ── Новини ───────────────────────────────────────────────────────── */}
      {news.length > 0 && (
        <section className="mt-24" aria-labelledby="news-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="news-heading" className="section-title">
              {t.home.newsHeading}
            </h2>
            <Link href={`/${locale}/news`} className="link-quiet inline-flex min-h-11 items-center text-sm">
              {t.home.newsAll}
            </Link>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {news.map((post) => (
              <li key={post.slug} className="panel group relative flex flex-col p-6 transition-colors hover:border-cyan-400/30">
                {post.publishedAt && (
                  <p className="text-xs text-silver-500">
                    <time dateTime={post.publishedAt.toISOString()}>
                      {post.publishedAt.toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </time>
                  </p>
                )}
                <h3 className="mt-3 font-display text-lg font-semibold leading-snug tracking-[-0.015em] text-silver-100">
                  {/* Цялата карта е цел за клик чрез разтегнат псевдоелемент на
                      ЕДИНСТВЕНАТА връзка — без вложени връзки и без втори таб-стоп. */}
                  <Link
                    href={`/${locale}/news/${post.slug}`}
                    className="after:absolute after:inset-0 after:rounded-2xl group-hover:text-cyan-200"
                  >
                    {post.title}
                  </Link>
                </h3>
                <p className="mt-2 leading-relaxed text-silver-400">{post.excerpt}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="mt-24 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" aria-labelledby="faq-heading">
        <div>
          <h2 id="faq-heading" className="section-title">
            {t.home.faqHeading}
          </h2>
          <p className="mt-4 max-w-sm text-silver-400">
            {t.home.discordLead}{' '}
            <a href={DISCORD_INVITE} rel="noopener nofollow" className="link">
              {t.home.discordCta}
            </a>
            .
          </p>
        </div>
        {/* Родният `details`: отговорът е в HTML-а и за търсачката, и без
            JavaScript — разгъвачът само го прибира визуално. Първият е отворен,
            за да се вижда веднага, че вътре има отговор. */}
        <div className="border-t border-white/[0.08]">
          {faq.map((item, index) => (
            <details key={item.question} className="faq-item" open={index === 0}>
              <summary>{item.question}</summary>
              <p className="pb-6 pe-8 leading-relaxed text-silver-400">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <JsonLd data={faqJsonLd(faq)} />
      {/* ItemList само за показаните — обявяваме каквото се вижда, не целия
          каталог. Пълният списък е обявен на /servers. */}
      <JsonLd data={serverListJsonLd(locale, featured)} />
    </>
  );
}
