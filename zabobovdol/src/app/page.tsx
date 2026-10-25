import Link from "next/link";
import { SITE, PRIMARY_NAV, QUICK_DAILY } from "@/lib/site";
import { SearchBar } from "@/components/SearchBar";
import { Section, SectionHeader, EmptyState, FilterChips } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { faqPageLd } from "@/lib/seo";
import { plainText } from "@/lib/markdown";
import { SERVICE_CATEGORY_LABELS } from "@/lib/categories";
import { BannerCard, BannerEmptySlot } from "@/components/BannerCard";
import { ScamBanner } from "@/components/ScamBanner";
import { WeatherWidget } from "@/components/WeatherWidget";
import { TodayPanel } from "@/components/TodayPanel";
import { LatestNews } from "@/components/LatestNews";
import { TelLink } from "@/components/TelLink";
import { PhoneButton } from "@/components/PhoneButton";
import { ViberButton } from "@/components/ViberButton";
import { isDangerNav, navIcon } from "@/components/nav-icons";
import {
  getBanners,
  getDutyToday,
  getEmergencyServices,
  getFeaturedBusinesses,
  getLatestListings,
  getLatestPosts,
  getOutagesTodayTomorrow,
  getTopFaqs,
  getUpcomingEvents,
} from "@/lib/cache";
import { getViberChannelUrl } from "@/lib/settings";
import { nextBuses, pickTodayOutages, todayCalendar } from "@/lib/today";
import { BUS } from "@/lib/bus-schedule";
import { newsDate } from "@/lib/ingest-news-rss";
import { formatTime, formatWeekdayDayMonth, isoDateTime } from "@/lib/format-date";
import { formatPhoneBg, nationalDigits } from "@/lib/phone";
import { ChevronRight, Inbox, MapPin, Phone, Plus } from "@/components/icons";

export const dynamic = "force-dynamic";

// Иконните квадратчета са в ЕДИН тон (brand). Червено — само „Пазете се от
// измами“ (опасност), сиво — некролозите (траур). Пълни имена на класовете,
// за да ги вижда Tailwind.
function chipClass(href: string, size: "sm" | "lg"): string {
  const base = size === "sm" ? "icon-chip-sm" : "icon-chip sm:h-16 sm:w-16";
  if (isDangerNav(href)) return `${base} icon-chip-danger`;
  if (href === "/pomeni") return `${base} icon-chip-neutral`;
  return base;
}

// „Банка ДСК — Бобов дол“: тирето остава в края на реда, не в началото на
// следващия (неразделящ интервал пред него). Само за показване.
function glueDash(s: string): string {
  return s.replace(/ ([—–]) /g, "\u00a0$1 ");
}

// Меко тире (U+00AD) в най-дългата дума на плочките „Всички раздели“: ако тя
// не се побира (само 320px при шрифт 125%), се пренася ПРАВИЛНО
// („Нерегла-ментирани“), а не се реже на произволна буква. Само за първа дума
// в етикета: в средата на реда браузърът предпочита тирето пред пренасяне на
// цялата дума („График за смето-събиране“). Само за показване — етикетите в
// site.ts остават чисти (менюта, търсене, 404).
const SOFT_HYPHENS: Record<string, string> = {
  Нерегламентирани: "Нерегла\u00adментирани",
};
function softHyphens(s: string): string {
  return s.replace(/\p{L}{12,}/gu, (w) => SOFT_HYPHENS[w] ?? w);
}

// Редът на рекламите се измества с една позиция всяка минута (страницата е
// force-dynamic). На телефон се виждат първите 2 слота — така всеки платен
// банер се показва и там, на равни смени.
function rotate<T>(list: T[], by: number): T[] {
  if (list.length < 2) return list;
  const k = by % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

// Спешните телефони от админа (отметка „Спешен телефон“) без 112 — той е
// отделният червен бутон.
function is112(phone: string): boolean {
  return (nationalDigits(phone) ?? phone.trim()) === "112";
}

// Часът на събитие е „стенно“ софийско време от админ полето (виж
// lib/format-date.ts) — не зависи от часовата зона на сървъра.
function eventWhen(d: Date): string {
  return `${formatWeekdayDayMonth(d, { wall: true })}, ${formatTime(d, { wall: true })}`;
}

// Данните за панела „Днес“ са допълнение — ако някоя от заявките се провали
// (напр. таблицата още не е мигрирана), панелът просто я пропуска, вместо
// цялата начална страница да падне.
async function orEmpty<T>(label: string, p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch (err) {
    console.error(`[начална] ${label}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

// Покана вместо празна кутия „Още няма…“ — положително, без „помогнете ни да
// я напълним“. С телефон за хората без смартфон.
function FillStrip({ events, listings }: { events: boolean; listings: boolean }) {
  const title =
    events && listings
      ? "Имате обява или събитие? Публикуваме ги безплатно."
      : listings
        ? "Продавате, търсите или подарявате нещо? Пуснете безплатна обява."
        : "Организирате събитие в града? Кажете ни и ще го публикуваме.";
  return (
    <section aria-labelledby="pokana-zaglavie" className="container-content pb-10">
      <div className="panel flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="min-w-[min(14rem,100%)] flex-1">
          <h2 id="pokana-zaglavie" className="font-display text-xl font-bold text-slate-900">
            {title}
          </h2>
          {SITE.contact.phone && (
            <p className="mt-1 text-base text-slate-700">
              Нямате смартфон? Обадете ни се и ни кажете.
            </p>
          )}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          {listings && (
            <Link href="/obyavi/nova" className="btn-secondary">
              Подайте обява
            </Link>
          )}
          {events && (
            <Link href="/kontakti" className="btn-secondary">
              Кажете ни за събитие
            </Link>
          )}
          {/* Телефонът е бутон (≥44px), не малка връзка в изречението —
              поканата е точно за хората, на които им е трудно с телефона. */}
          {SITE.contact.phone && <PhoneButton phone={SITE.contact.phone} />}
        </div>
      </div>
    </section>
  );
}

export default async function HomePage() {
  const now = new Date();
  const [
    topFaqs,
    events,
    listings,
    businesses,
    banners,
    dutyToday,
    outageRows,
    latestPosts,
    emergency,
    viberUrl,
  ] = await Promise.all([
    getTopFaqs(),
    getUpcomingEvents(),
    getLatestListings(),
    getFeaturedBusinesses(),
    getBanners(),
    orEmpty("дежурна аптека", getDutyToday()),
    orEmpty("прекъсвания", getOutagesTodayTomorrow()),
    orEmpty("новини", getLatestPosts()),
    orEmpty("спешни телефони", getEmergencyServices()),
    getViberChannelUrl(),
  ]);

  const otherEmergency = emergency.filter((s) => s.phone && !is112(s.phone));

  // Винаги 4 слота: запълнените с реклами (на смени, виж rotate), останалите
  // — покана. На телефон се виждат първите 2 (рекламата не изтиква
  // гражданското съдържание).
  const rotatedBanners = rotate(banners, Math.floor(now.getTime() / 60_000));
  const bannerSlots = Array.from({ length: 4 }, (_, i) => rotatedBanners[i] ?? null);

  const latest = latestPosts[0];
  const todayNews = latest ? { slug: latest.slug, title: latest.title, date: newsDate(latest) } : null;

  const bothFeeds = events.length > 0 && listings.length > 0;
  const feedGrid = bothFeeds ? "grid gap-4" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <>
      {topFaqs.length > 0 && (
        <JsonLd
          data={faqPageLd(
            topFaqs.map((f) => ({
              question: f.question,
              answerText: plainText(f.answer, 300),
            })),
          )}
        />
      )}

      {/* Лента с предупреждение за актуална измама (ако има закачена) */}
      <ScamBanner />

      {/* Заглавна секция. На телефон е по-ниска (без чиповете и с едно
          изречение увод), за да се вижда спешната лента и „Днес“ без скрол. */}
      <section className="relative overflow-hidden bg-brand-800 text-white">
        {/* Декоративен релеф на долината (намек за „долината с форма на боб“).
            fill-* (а не text-* + currentColor): текстовите цветове се
            пренасочват в тъмен режим и долната вълна ставаше светлосиня ивица. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full sm:h-28 lg:h-32"
          viewBox="0 0 1440 200"
          preserveAspectRatio="none"
        >
          <path
            d="M0 200 L0 120 C 180 70 320 150 520 110 C 720 70 820 160 1040 120 C 1240 84 1320 150 1440 110 L1440 200 Z"
            className="fill-brand-900/60"
          />
          <path
            d="M0 200 L0 160 C 240 120 420 180 640 150 C 900 116 1060 184 1440 150 L1440 200 Z"
            className="fill-brand-900"
          />
        </svg>

        {/* От xl гербът-воден знак е СОБСТВЕНА клетка на мрежата (не absolute
            над текста) — до увода и търсачката, над реда с чиповете. Не може да
            застъпи нищо при никоя ширина и размер на шрифта. Под xl го няма. */}
        <div className="container-content relative pb-10 pt-8 sm:pb-20 sm:pt-14 lg:pb-16 lg:pt-12 xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:gap-x-12">
          <div className="relative min-w-0">
            {/* Независимостта — още над прегъвката: това НЕ е сайтът на общината. */}
            <p className="eyebrow text-gold-300">
              Независима гражданска инициатива&nbsp;· {SITE.geo.region}
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-[1.1] sm:text-5xl">
              Всичко за <span className="text-gold-300">Бобов&nbsp;дол</span>&nbsp;— на едно място
            </h1>
            <p className="mt-3 max-w-2xl text-lg text-brand-50 sm:mt-4">
              Важни телефони, обяснения стъпка по стъпка, събития и обяви — от местни хора за
              местни хора.
              <span className="hidden sm:inline"> Лесно и разбираемо, за всички възрасти.</span>
            </p>
            <div className="hero-search mt-5 max-w-xl rounded-xl bg-white p-1.5 shadow-lg sm:mt-7">
              <SearchBar />
            </div>
            <Link
              href="/kak-da-polzvam-sayta"
              className="mt-2 inline-flex min-h-tap items-center text-base font-medium text-gold-200 underline decoration-gold-200/60 underline-offset-4 hover:decoration-gold-200"
            >
              {/* Стрелката е залепена за последната дума: на телефон редът се
                  пренася, а „→“ не остава сам вдясно. */}
              <span>
                Първи път сте тук? Вижте как да ползвате{" "}
                <span className="whitespace-nowrap">
                  сайта
                  <span aria-hidden="true" className="ml-1.5 inline-block">
                    →
                  </span>
                </span>
              </span>
            </Link>
          </div>
          {/* Версията с прозрачен фон — иначе белият фон личи като кутия.
              Височина в px: не расте с шрифта от „Настройки за четене“. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/bobov-dol-grb-mark.png"
            alt=""
            aria-hidden
            className="pointer-events-none hidden h-[320px] w-auto select-none opacity-[0.07] xl:block"
            width={320}
            height={460}
          />
          {/* Ежедневните неща, които ги няма в картите отдолу — само от sm.
              От xl редът е под герба, на цялата ширина (не се пренася). */}
          <nav aria-label="Всеки ден" className="relative mt-4 hidden sm:block xl:col-span-2">
            <ul className="flex flex-wrap gap-2">
              {QUICK_DAILY.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="chip-on-dark">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* Спешни телефони. Червеното е само за спешност: 112 е единственият
          червен бутон. До него — номерата с отметка „Спешен телефон“ от
          админа (и на телефон), после връзка към всички телефони. */}
      <section aria-label="Спешни телефони" className="border-b border-crimson-200 bg-crimson-50">
        <div className="container-content flex flex-wrap items-center gap-x-5 gap-y-1 py-2.5">
          {/* flex-wrap: на 320px при шрифт 125% бутонът минава под „При
              спешност“ (иначе редът беше 383px при колона 288px). */}
          <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:w-auto sm:justify-start sm:gap-x-5">
            <p className="text-lg font-bold text-crimson-700">При спешност</p>
            <TelLink phone="112" className="btn-danger shrink-0 px-4 tabular-nums sm:px-5">
              <Phone className="h-5 w-5 shrink-0" aria-hidden />
              Спешност 112
            </TelLink>
          </div>
          {otherEmergency.length === 0 && (
            <p className="hidden text-base text-slate-700 lg:block">
              Безплатно, от всеки телефон, денонощно.
            </p>
          )}
          {otherEmergency.length > 0 && (
            <ul
              aria-label="Други спешни телефони"
              className="flex w-full flex-wrap gap-x-5 sm:w-auto sm:min-w-[16rem] sm:flex-1"
            >
              {otherEmergency.map((s) => (
                <li key={s.id}>
                  <TelLink
                    phone={s.phone}
                    className="link-quiet inline-flex min-h-tap items-center font-semibold text-slate-900"
                  >
                    {s.name.includes(s.phone) ? (
                      s.name
                    ) : (
                      <span>
                        {s.name}{" "}
                        <span className="whitespace-nowrap tabular-nums">{formatPhoneBg(s.phone)}</span>
                      </span>
                    )}
                  </TelLink>
                </li>
              ))}
            </ul>
          )}
          <Link href="/uslugi" className="link-more sm:ml-auto">
            Всички важни телефони
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* „Днес в Бобов дол“ — дата и имен ден, дежурна аптека, спиране на ток
          и вода, следващ автобус, последна новина. Над плочките. */}
      <div className="container-content pt-6">
        <TodayPanel
          now={now}
          calendar={todayCalendar(now)}
          duty={dutyToday}
          outages={pickTodayOutages(outageRows, now)}
          buses={nextBuses(BUS.directions, now)}
          news={todayNews}
          aside={<WeatherWidget />}
        />
      </div>

      {/* Бързи раздели. PRIMARY_NAV е подреден по важност, затова първите шест
          са едри („това търсят хората най-често“), а останалите — компактни.
          21 еднакви карти са твърде много за сканиране от възрастен човек. */}
      <Section title="Най-търсено">
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {PRIMARY_NAV.slice(0, 6).map((item) => {
            const Icon = navIcon(item.href);
            return (
              <li key={item.href} className="flex">
                <Link
                  href={item.href}
                  className="card group flex w-full items-start gap-3 p-4 sm:gap-4 sm:p-5"
                >
                  <span className={chipClass(item.href, "lg")}>
                    <Icon className="h-7 w-7 sm:h-9 sm:w-9" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-xl font-bold leading-snug text-slate-900 decoration-2 underline-offset-4 group-hover:underline">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-base text-slate-600">{item.description}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <h3 className="h-sub mb-4 mt-10">Всички раздели</h3>
        {/* Ширината на колоната е в rem, не брой колони: при шрифт 112,5%/125%
            колоните сами намаляват и най-дългата дума („Нерегламентирани“ —
            ~11rem) се събира цяла до иконата. На телефон плочките са редове на
            цялата ширина; стрелката „›“ се показва само ако остава място за
            думата (container query, също в rem). Под това — меко тире. */}
        <ul className="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] sm:gap-3">
          {PRIMARY_NAV.slice(6).map((item) => {
            const Icon = navIcon(item.href);
            return (
              <li key={item.href} className="flex [container-type:inline-size]">
                <Link
                  href={item.href}
                  className="card group flex min-h-[3.5rem] w-full min-w-0 items-center gap-3 rounded-xl px-2.5 py-2 sm:py-3 [@container_(min-width:18rem)]:px-3"
                >
                  <span className={chipClass(item.href, "sm")}>
                    <Icon aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 break-words font-semibold leading-snug text-slate-900 underline-offset-4 group-hover:underline">
                    {softHyphens(item.label)}
                  </span>
                  <ChevronRight
                    className="hidden h-5 w-5 shrink-0 text-slate-500 max-sm:[@container_(min-width:18rem)]:block"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* „Последно от общината“ — само ако има публикувани новини. */}
      <LatestNews />

      {/* Абониране — ненатрапчиво каре към известията (и Viber, ако го има). */}
      <section aria-label="Известия на телефона" className="container-content pb-10">
        <div className="panel flex flex-wrap items-center gap-x-5 gap-y-4">
          <span className="icon-chip hidden sm:grid">
            <Inbox aria-hidden />
          </span>
          <p className="min-w-[min(14rem,100%)] flex-1 text-lg text-slate-800">
            Искате ли да ви казваме, когато спира токът или има нова измама?
          </p>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Link href="/izvestiya" className="btn-secondary">
              Включете известията
            </Link>
            {viberUrl && <ViberButton url={viberUrl} />}
          </div>
        </div>
      </section>

      {/* Популярни „Как да“ — на телефон 4, от md нагоре всички. */}
      <Section title="Популярни въпроси „Как да…“" href="/kak-da" tone="muted">
        {topFaqs.length === 0 ? (
          <EmptyState title="Скоро тук ще има полезни въпроси и отговори." />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 max-md:[&>*:nth-child(n+5)]:hidden">
            {topFaqs.map((f) => (
              <li key={f.id} className="flex">
                <Link href={`/kak-da/${f.slug}`} className="card group flex w-full flex-col">
                  <span className="badge">{f.category}</span>
                  <h3 className="h-card mt-2 group-hover:underline">{f.question}</h3>
                  <p className="mt-1 text-base text-slate-600">{plainText(f.answer, 120)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Събития и обяви — показват се само ако има какво (по брой, както
          „Местен бизнес“). Празен раздел → покана (FillStrip). */}
      {(events.length > 0 || listings.length > 0) && (
        <div className={"container-content grid gap-10 py-10" + (bothFeeds ? " lg:grid-cols-2" : "")}>
          {events.length > 0 && (
            <section aria-labelledby="sabitiya-zaglavie">
              <SectionHeader id="sabitiya-zaglavie" title="Предстоящи събития" href="/sabitiya" />
              <ul className={feedGrid}>
                {events.map((e) => (
                  <li key={e.id} className="flex">
                    <Link href={`/sabitiya/${e.slug}`} className="card group flex w-full flex-col">
                      <p className="text-base font-semibold text-brand-700">
                        <time dateTime={isoDateTime(e.startAt, { wall: true })}>{eventWhen(e.startAt)}</time>
                      </p>
                      <h3 className="h-card mt-1 group-hover:underline">{glueDash(e.title)}</h3>
                      {e.location && (
                        <p className="mt-1 flex items-start gap-1.5 text-base text-slate-600">
                          <MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                          <span className="min-w-0">{e.location}</span>
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {listings.length > 0 && (
            <section aria-labelledby="obyavi-zaglavie">
              <SectionHeader id="obyavi-zaglavie" title="Последни обяви" href="/obyavi" />
              <ul className={feedGrid}>
                {listings.map((l) => (
                  <li key={l.id} className="flex">
                    <Link href={`/obyavi/${l.slug}`} className="card group flex w-full flex-col">
                      <h3 className="h-card group-hover:underline">{glueDash(l.title)}</h3>
                      <p className="mt-1 text-base text-slate-600">{plainText(l.description, 100)}</p>
                      {l.price && (
                        <p className="mt-auto pt-2 font-semibold text-brand-700">{l.price}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {(events.length === 0 || listings.length === 0) && (
        <FillStrip events={events.length === 0} listings={listings.length === 0} />
      )}

      {/* Местен бизнес. При по-малко от 4 фирми — покана да добавят своя. */}
      {businesses.length > 0 && (
        <Section title="Местен бизнес" href="/biznes" tone="muted">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {businesses.map((b) => (
              <li key={b.id} className="flex">
                <Link href={`/biznes/${b.slug}`} className="card group flex w-full flex-col">
                  <h3 className="h-card group-hover:underline">{glueDash(b.name)}</h3>
                  {b.address && (
                    <p className="mt-1 flex items-start gap-1.5 text-base text-slate-600">
                      <MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                      <span className="min-w-0">{b.address}</span>
                    </p>
                  )}
                </Link>
              </li>
            ))}
            {businesses.length < 4 && (
              <li className="flex">
                <Link
                  href="/biznes/nova"
                  className="card group flex w-full flex-col items-start gap-2 border-dashed"
                >
                  <span className="icon-chip-sm">
                    <Plus aria-hidden />
                  </span>
                  <span className="h-card group-hover:underline">
                    Добавете своя бизнес
                    <span aria-hidden="true">&nbsp;→</span>
                  </span>
                  <span className="text-base text-slate-600">Безплатно — с кратка форма.</span>
                </Link>
              </li>
            )}
          </ul>
        </Section>
      )}

      {/* Реклама — след гражданското съдържание, с малък надпис (без златната
          черта на разделите). Всеки банер носи и свой етикет „Реклама“. */}
      <section aria-labelledby="reklama-zaglavie" className="container-content py-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4">
          <h2 id="reklama-zaglavie" className="label-caps">
            Реклама
          </h2>
          <Link href="/reklama" className="link-more">
            Рекламирайте при нас
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-sm:[&>*:nth-child(n+3)]:hidden">
          {bannerSlots.map((b, i) => (
            <li key={b ? b.id : `empty-${i}`} className="flex">
              {b ? (
                <BannerCard
                  banner={{
                    id: b.id,
                    title: b.title,
                    sponsor: b.sponsor,
                    description: b.description,
                    imageUrl: b.imageUrl,
                    linkUrl: b.linkUrl,
                    bgColor: b.bgColor,
                    accentColor: b.accentColor,
                  }}
                />
              ) : (
                <BannerEmptySlot />
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Помощ онлайн + взаимопомощ — единственият акцентен (brand-50) блок. */}
      <section aria-labelledby="pomosht-zaglavie" className="bg-brand-50">
        <div className="container-content grid items-center gap-6 py-12 md:grid-cols-[minmax(0,1fr)_auto] md:gap-10">
          <div>
            <h2 id="pomosht-zaglavie" className="section-title">
              Не се справяте онлайн? Помагаме безплатно.
            </h2>
            <p className="mt-4 max-w-2xl text-slate-700">
              Питайте дигиталния помощник долу вдясно или вижте обясненията{" "}
              „Как да…“ — стъпка по стъпка, на разбираем език, за всички възрасти.
              А ако възрастен човек се нуждае от подкрепа, вижте „Зов за помощ“.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:w-64">
            <Link href="/kak-da" className="btn-primary">
              Вижте „Как да…“
            </Link>
            <Link href="/zov-za-pomosht" className="btn-secondary">
              Зов за помощ
            </Link>
          </div>
        </div>
      </section>

      {/* Бърз достъп до категории услуги (помага за GEO/AEO) */}
      <Section title="Услуги по категории" href="/uslugi">
        <FilterChips
          label="Категории услуги"
          items={Object.entries(SERVICE_CATEGORY_LABELS).map(([key, label]) => ({
            href: `/uslugi?cat=${key}`,
            label,
          }))}
        />
      </Section>
    </>
  );
}
