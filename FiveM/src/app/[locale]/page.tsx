import { existsSync } from 'node:fs';
import path from 'node:path';

import Image from 'next/image';
import Link from 'next/link';

import { JsonLd } from '@/components/JsonLd';
import { Badge } from '@/components/Badge';
import { Icon } from '@/components/Icon';
import { Mascot } from '@/components/Mascot';
import { ServerCard } from '@/components/ServerCard';
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

/** Колко сървъра показва тийзърът. Landing, не каталог — пълният е на /servers. */
const TEASER = 6;
const NEWS_TEASER = 3;

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
    keywords:
      locale === 'bg'
        ? ['български FiveM сървъри', 'FiveM roleplay България', 'GTA V RP сървъри', 'FiveM BG общност']
        : ['Bulgarian FiveM servers', 'FiveM roleplay Bulgaria', 'GTA V RP servers', 'FiveM BG community'],
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
    { value: servers.length, label: t.home.statServers },
    { value: online.length, label: t.home.statOnline },
    { value: totalPlayers, label: t.home.statPlayers },
    { value: streamers.live, label: t.home.statStreamers },
  ];

  const why = [
    { icon: 'online', title: t.home.whyLiveTitle, body: t.home.whyLiveBody },
    { icon: 'filter', title: t.home.whyFilterTitle, body: t.home.whyFilterBody },
    { icon: 'promoted', title: t.home.whyHonestTitle, body: t.home.whyHonestBody },
  ];

  const steps = [
    { icon: 'search', title: t.home.stepFindTitle, body: t.home.stepFindBody },
    { icon: 'info', title: t.home.stepCheckTitle, body: t.home.stepCheckBody },
    { icon: 'join', title: t.home.stepJoinTitle, body: t.home.stepJoinBody },
  ];

  return (
    <>
      {/* ── Герой ────────────────────────────────────────────────────────── */}
      {/* `-z-10` + `overflow-hidden` държат фона зад съдържанието, без да
          порасне хоризонталният скрол — измерено на 360/768/1280. */}
      <section className="relative -mx-4 overflow-hidden px-4 pb-14 pt-10 sm:pt-16">
        {heroImage ? (
          <>
            {/* Снимката е ФОН, не съдържание → `alt=""` и `aria-hidden`.
                `priority` е задължителен: това е LCP елементът, а без него Next
                го зарежда мързеливо и метриката се срива. */}
            <Image
              src={heroImage}
              alt=""
              aria-hidden="true"
              fill
              priority
              sizes="100vw"
              className="pointer-events-none absolute inset-0 -z-10 object-cover"
            />
            {/* Затъмнението НЕ е вкус — то пази контраста на текста над
                произволна снимка. Без него светъл кадър прави заглавието
                нечетимо и пада 1.4.3. Плътността е избрана да държи
                `silver-400` над 4,5:1 и при светъл фон. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-ink-950 via-ink-950/90 to-ink-950/70"
            />
          </>
        ) : (
          /* Без снимка героят пак не е гол: конични/радиални градиенти тежат
             нула байта и не искат втора заявка. */
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_20%_0%,rgba(34,211,238,0.14),transparent_65%),radial-gradient(45%_45%_at_85%_10%,rgba(16,185,129,0.10),transparent_60%)]"
          />
        )}
        <div className="flex flex-col-reverse items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm text-cyan-300">
              <Icon group="status" name="online" size={16} />
              {t.home.heroKicker}
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              <span className="text-chrome">{t.home.h1}</span>
            </h1>
            <p className="mt-4 text-lg text-silver-400">{t.home.intro}</p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={`/${locale}/servers`}
                className="rounded-lg bg-cyan-500 px-5 py-2.5 font-medium text-ink-950 transition-colors hover:bg-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                {t.home.ctaBrowse}
              </Link>
              <Link
                href={`/${locale}/submit`}
                className="rounded-lg border border-white/15 px-5 py-2.5 transition-colors hover:border-cyan-500 hover:text-cyan-300"
              >
                {t.home.ctaSubmit}
              </Link>
            </div>
          </div>

          {/* Герой-кадър: пълното ниво (градиенти, ореол, мехурчета) си струва само
              над 128 px. Погледът следи курсора, а анимацията мълчи при
              prefers-reduced-motion — и двете са вградени в компонента. */}
          <Mascot
            detail="full"
            size={196}
            pose="wave"
            expression="happy"
            gaze="follow"
            animated
            title={null}
            className="shrink-0"
          />
        </div>

        {/* ── Живите числа ───────────────────────────────────────────────── */}
        {servers.length > 0 && (
          <dl className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-white/10 bg-ink-900/70 px-4 py-3"
              >
                <dt className="text-xs uppercase tracking-wide text-silver-500">{stat.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-cyan-300">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* ── Защо тук ─────────────────────────────────────────────────────── */}
      <section className="mt-4" aria-labelledby="why-heading">
        <h2 id="why-heading" className="text-2xl font-semibold tracking-tight">
          {t.home.whyHeading}
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {why.map((item) => (
            <li key={item.title} className="rounded-xl border border-white/10 bg-ink-900/70 p-5">
              <Badge name={item.icon} size={32} />
              <h3 className="mt-3 font-medium">{item.title}</h3>
              <p className="mt-1.5 text-sm text-silver-400">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Как работи ───────────────────────────────────────────────────── */}
      <section className="mt-14" aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-2xl font-semibold tracking-tight">
          {t.home.howHeading}
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-white/10 p-5">
              <p className="flex items-center gap-2 text-sm text-cyan-300">
                <span className="tabular-nums">{index + 1}</span>
                <Icon group="ui" name={step.icon} size={16} />
              </p>
              <h3 className="mt-2 font-medium">{step.title}</h3>
              <p className="mt-1.5 text-sm text-silver-400">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Тийзър със сървъри ───────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="mt-14" aria-labelledby="teaser-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="teaser-heading" className="text-2xl font-semibold tracking-tight">
              {t.home.teaserHeading}
            </h2>
            <Link
              href={`/${locale}/servers`}
              className="text-sm text-cyan-300 underline underline-offset-2"
            >
              {t.home.teaserAll} ({servers.length})
            </Link>
          </div>

          {/* Тук СЪЩО има класирани резултати (промотираните са първи), значи
              разкритието по чл. 7, ал. 4а от Дир. 2005/29/ЕО трябва да е и тук,
              не само на /servers. Линк само от каталога би оставил landing-а с
              платено класиране без обяснение — точно забранената практика. */}
          <p className="mt-2 text-sm text-silver-500">
            <Link
              href={`/${locale}/terms#kak-podrezhdame-sarvarite`}
              className="text-cyan-300 underline underline-offset-2"
            >
              {t.home.rankingLink}
            </Link>
          </p>

          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((server) => (
              <ServerCard key={server.slug} server={server} locale={locale} t={t} />
            ))}
          </ul>
        </section>
      )}

      {servers.length === 0 && (
        <section className="mt-14">
          <p className="rounded-xl border border-dashed border-white/15 p-6 text-silver-400">
            {t.home.emptyLead}{' '}
            <Link href={`/${locale}/submit`} className="text-cyan-300 underline underline-offset-2">
              {t.home.emptyCta}
            </Link>{' '}
            {t.home.emptyTail}
          </p>
        </section>
      )}

      {/* ── Стриймъри ────────────────────────────────────────────────────── */}
      {streamers.total > 0 && (
        <section className="mt-14 rounded-xl border border-white/10 bg-ink-900/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{t.home.streamersHeading}</h2>
              <p className="mt-1 text-sm text-silver-400">
                {streamers.live > 0
                  ? `${streamers.live} ${t.home.streamersLive}`
                  : t.home.streamersNone}
              </p>
            </div>
            <Link
              href={`/${locale}/streamers`}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:border-cyan-500 hover:text-cyan-300"
            >
              {t.home.streamersCta}
            </Link>
          </div>
        </section>
      )}

      {/* ── Новини ───────────────────────────────────────────────────────── */}
      {news.length > 0 && (
        <section className="mt-14" aria-labelledby="news-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="news-heading" className="text-2xl font-semibold tracking-tight">
              {t.home.newsHeading}
            </h2>
            <Link
              href={`/${locale}/news`}
              className="text-sm text-cyan-300 underline underline-offset-2"
            >
              {t.home.newsAll}
            </Link>
          </div>
          <ul className="mt-5 grid gap-4 sm:grid-cols-3">
            {news.map((post) => (
              <li key={post.slug} className="rounded-xl border border-white/10 p-5">
                <h3 className="font-medium">
                  <Link href={`/${locale}/news/${post.slug}`} className="hover:text-cyan-300">
                    {post.title}
                  </Link>
                </h3>
                <p className="mt-1.5 text-sm text-silver-400">{post.excerpt}</p>
                {post.publishedAt && (
                  <p className="mt-2 text-xs text-silver-500">
                    <time dateTime={post.publishedAt.toISOString()}>
                      {post.publishedAt.toISOString().slice(0, 10)}
                    </time>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Discord ──────────────────────────────────────────────────────── */}
      <section className="mt-14 rounded-xl border border-cyan-700/40 bg-cyan-900/10 p-5">
        <p className="text-silver-300">
          {t.home.discordLead}{' '}
          <a
            href={DISCORD_INVITE}
            rel="noopener nofollow"
            className="font-medium text-cyan-300 underline underline-offset-2"
          >
            {t.home.discordCta}
          </a>
          .
        </p>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="mt-14" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight">
          {t.home.faqHeading}
        </h2>
        <dl className="mt-6 space-y-6">
          {faq.map((item) => (
            <div key={item.question}>
              <dt className="font-medium">{item.question}</dt>
              <dd className="mt-1 text-silver-400">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <JsonLd data={faqJsonLd(faq)} />
      {/* ItemList само за показаните — обявяваме каквото се вижда, не целия
          каталог. Пълният списък е обявен на /servers. */}
      <JsonLd data={serverListJsonLd(locale, featured)} />
    </>
  );
}
