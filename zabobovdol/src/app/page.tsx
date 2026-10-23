import Link from "next/link";
import { SITE, PRIMARY_NAV, localPhone } from "@/lib/site";
import { SearchBar } from "@/components/SearchBar";
import { Section, EmptyState } from "@/components/ui";
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
import { ViberButton } from "@/components/ViberButton";
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
import {
  HelpCircle,
  Phone,
  Store,
  CalendarDays,
  CalendarClock,
  Megaphone,
  Bus,
  Newspaper,
  AlertTriangle,
  Landmark,
  HeartHandshake,
  Users,
  Images,
  ShieldAlert,
  Cross,
  Coins,
  Trash2,
  Euro,
  BookOpen,
  Camera,
  Zap,
  Banknote,
  Flame,
  type LucideIcon,
} from "@/components/icons";

const NAV_ICONS: Record<string, LucideIcon> = {
  "/kak-da": HelpCircle,
  "/uslugi": Phone,
  "/izmami": ShieldAlert,
  "/dezhurna-apteka": Cross,
  "/pomoshti": Coins,
  "/evroto": Euro,
  "/biznes": Store,
  "/sabitiya": CalendarDays,
  "/imen-den": CalendarDays,
  "/danaci-srokove": CalendarClock,
  "/grafik-smetosabirane": Trash2,
  "/obyavi": Megaphone,
  "/transport": Bus,
  "/novini": Newspaper,
  "/signali": AlertTriangle,
  "/prozrachnost": Banknote,
  "/prekysvaniya": Zap,
  "/smetishta": Trash2,
  "/grada": BookOpen,
  "/istoriya": Landmark,
  "/zov-za-pomosht": HeartHandshake,
  "/dobrovolci": Users,
  "/spomeni": Images,
  "/galeriya": Camera,
  "/pomeni": Flame,
};

// Цветова тема за всяка категория — за по-лесно разпознаване и по-жив вид.
// Ползваме нюанси -100/-700, които НЕ се променят в тъмен режим (остават
// като цветни „значки" на тъмните карти).
const NAV_COLOR: Record<string, string> = {
  "/kak-da": "blue", "/uslugi": "sky", "/novini": "blue",
  "/izmami": "rose", "/signali": "rose", "/zov-za-pomosht": "rose", "/sabitiya": "rose",
  "/dezhurna-apteka": "green", "/smetishta": "green", "/grafik-smetosabirane": "green",
  "/pomoshti": "amber", "/evroto": "amber", "/prekysvaniya": "amber", "/istoriya": "amber", "/danaci-srokove": "orange",
  "/biznes": "purple", "/spomeni": "purple", "/galeriya": "purple", "/imen-den": "purple",
  "/obyavi": "orange",
  "/transport": "sky",
  "/prozrachnost": "teal", "/grada": "teal", "/dobrovolci": "teal",
  // Некролозите — тихо, без ярък цвят (свещ в сиво).
  "/pomeni": "slate",
};
const COLOR: Record<string, { chip: string; title: string }> = {
  blue: { chip: "bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white", title: "group-hover:text-blue-700" },
  sky: { chip: "bg-sky-100 text-sky-700 group-hover:bg-sky-600 group-hover:text-white", title: "group-hover:text-sky-700" },
  green: { chip: "bg-green-100 text-green-700 group-hover:bg-green-600 group-hover:text-white", title: "group-hover:text-green-700" },
  amber: { chip: "bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white", title: "group-hover:text-amber-700" },
  rose: { chip: "bg-rose-100 text-rose-700 group-hover:bg-rose-600 group-hover:text-white", title: "group-hover:text-rose-700" },
  purple: { chip: "bg-purple-100 text-purple-700 group-hover:bg-purple-600 group-hover:text-white", title: "group-hover:text-purple-700" },
  orange: { chip: "bg-orange-100 text-orange-700 group-hover:bg-orange-600 group-hover:text-white", title: "group-hover:text-orange-700" },
  teal: { chip: "bg-teal-100 text-teal-700 group-hover:bg-teal-600 group-hover:text-white", title: "group-hover:text-teal-700" },
  // Без смяна на цвета на заглавието при посочване: group-hover:text-slate-*
  // няма тъмен вариант и би станал тъмен текст на тъмна карта.
  slate: { chip: "bg-slate-100 text-slate-700 group-hover:bg-slate-600 group-hover:text-white", title: "" },
};

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
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

// „Помогнете ни да я напълним“ — вместо празна кутия „Още няма…“. С телефон
// за хората без смартфон. Навигацията към разделите остава непокътната.
function FillStrip({ events, listings }: { events: boolean; listings: boolean }) {
  const sections =
    events && listings ? "„Обяви“ и „Събития“" : listings ? "„Обяви“" : "„Събития“";
  return (
    <section aria-label={`Помогнете ни да напълним ${sections}`} className="border-y border-slate-200/70 bg-slate-50">
      <div className="container-content flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
        <div className="min-w-[14rem] flex-1">
          <p className="text-lg font-semibold text-slate-900">
            Помогнете ни да напълним {sections}
          </p>
          {SITE.contact.phone && (
            <p className="text-base text-slate-700">
              Нямате смартфон? Обадете се на{" "}
              <TelLink
                phone={SITE.contact.phone}
                className="whitespace-nowrap font-semibold text-brand-700 underline underline-offset-4"
              >
                {localPhone(SITE.contact.phone)}
              </TelLink>{" "}
              и ни кажете.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {listings && (
            <Link href="/obyavi/nova" className="btn-secondary">
              Пуснете обява
            </Link>
          )}
          {events && (
            <Link href="/kontakti" className="btn-secondary">
              Кажете ни за събитие
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export default async function HomePage() {
  const now = new Date();
  const [
    topFaqs,
    emergency,
    events,
    listings,
    businesses,
    banners,
    dutyToday,
    outageRows,
    latestPosts,
    viberUrl,
  ] = await Promise.all([
    getTopFaqs(),
    getEmergencyServices(),
    getUpcomingEvents(),
    getLatestListings(),
    getFeaturedBusinesses(),
    getBanners(),
    orEmpty("дежурна аптека", getDutyToday()),
    orEmpty("прекъсвания", getOutagesTodayTomorrow()),
    orEmpty("новини", getLatestPosts()),
    getViberChannelUrl(),
  ]);

  // Винаги показваме 4 слота: запълнените с реклами, останалите — покана.
  const bannerSlots = Array.from({ length: 4 }, (_, i) => banners[i] ?? null);

  const latest = latestPosts[0];
  const todayNews = latest ? { slug: latest.slug, title: latest.title, date: newsDate(latest) } : null;

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

      {/* Заглавна секция */}
      <section className="relative overflow-hidden bg-brand-800 text-white">
        {/* Декоративен релеф на долината (намек за „долината с форма на боб“). */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-brand-900/60"
          viewBox="0 0 1440 200"
          preserveAspectRatio="none"
        >
          <path d="M0 200 L0 120 C 180 70 320 150 520 110 C 720 70 820 160 1040 120 C 1240 84 1320 150 1440 110 L1440 200 Z" fill="currentColor" />
          <path d="M0 200 L0 160 C 240 120 420 180 640 150 C 900 116 1060 184 1440 150 L1440 200 Z" className="text-brand-900" fill="currentColor" />
        </svg>
        {/* Герб като воден знак */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/bobov-dol-grb.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-6 top-1/2 hidden -translate-y-1/2 opacity-[0.07] md:block"
          width={320}
          height={460}
        />

        <div className="container-content relative py-14 sm:py-20">
          <p className="eyebrow text-gold-300">
            {SITE.geo.city} · {SITE.geo.region}
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.1] sm:text-5xl">
            Всичко за{" "}
            <span className="text-gold-300">Бобов дол</span> — на едно място
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-brand-50">
            Направено от местни хора за местни хора: важни телефони и услуги,
            обяснения стъпка по стъпка, събития, обяви и взаимопомощ. Лесно и
            разбираемо, за всички възрасти.
          </p>
          <div className="mt-7 max-w-xl rounded-xl bg-white p-2 shadow-xl ring-1 ring-black/5">
            <SearchBar />
          </div>
          <Link
            href="/kak-da-polzvam-sayta"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-gold-200 underline-offset-2 hover:underline"
          >
            Нов тук? Вижте как да ползвате сайта →
          </Link>
          <div className="mt-6 flex flex-wrap gap-2">
            {PRIMARY_NAV.slice(0, 5).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Спешни телефони */}
      <section className="border-b border-amber-200 bg-amber-50">
        <div className="container-content flex flex-wrap items-center gap-x-5 gap-y-3 py-3.5">
          <span className="flex items-center gap-2 font-bold text-amber-900">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-200 text-amber-900">
              <Phone className="h-5 w-5" aria-hidden />
            </span>
            Спешни телефони
          </span>
          {/* 112 е най-важният номер — затова е бутон, а не ред в списък. */}
          <a
            href="tel:112"
            className="a11y-btn inline-flex items-center gap-2 rounded-lg bg-crimson-600 px-4 py-2 text-base font-bold text-white shadow-sm transition hover:bg-crimson-700"
          >
            Спешност 112
          </a>
          {emergency
            .filter((s) => s.phone !== "112")
            .map((s) => (
              <a
                key={s.id}
                href={`tel:${s.phone}`}
                className="a11y-btn inline-flex items-center rounded-lg px-2 text-base font-medium text-amber-900 underline decoration-amber-400 underline-offset-4 transition hover:decoration-amber-700"
              >
                {s.name.includes(s.phone) ? s.name : `${s.name} ${s.phone}`}
              </a>
            ))}
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
      <Section title="Какво търсите днес?">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRIMARY_NAV.slice(0, 6).map((item) => {
            const Icon = NAV_ICONS[item.href] ?? HelpCircle;
            const c = COLOR[NAV_COLOR[item.href] ?? "blue"];
            return (
              <Link key={item.href} href={item.href} className="card group flex items-start gap-4">
                <span className={"grid h-16 w-16 shrink-0 place-items-center rounded-2xl transition duration-200 group-hover:scale-110 " + c.chip}>
                  <Icon className="h-9 w-9" aria-hidden />
                </span>
                <span>
                  <span className={"block font-display text-xl font-bold text-slate-900 " + c.title}>
                    {item.label}
                  </span>
                  <span className="mt-1 block text-base text-slate-600">{item.description}</span>
                </span>
              </Link>
            );
          })}
        </div>

        <h3 className="mb-4 mt-10 font-display text-lg font-bold text-slate-700">
          Всички раздели
        </h3>
        {/* Под 360px две колони оставят ~123px за текста и дълги думи като
            „сметосъбиране“ не се побират — там минаваме на една колона. */}
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {PRIMARY_NAV.slice(6).map((item) => {
            const Icon = NAV_ICONS[item.href] ?? HelpCircle;
            const c = COLOR[NAV_COLOR[item.href] ?? "blue"];
            return (
              <Link
                key={item.href}
                href={item.href}
                /* На телефон иконата е отгоре, а надписът заема цялата ширина на
                   картата — при две колони на 390px за хоризонтален ред остават
                   ~95px и дълги имена („Транспорт“) се чупеха по средата на
                   думата. От sm нагоре има място и редът е хоризонтален. */
                className="group flex min-w-0 flex-col items-start gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md sm:flex-row sm:items-center sm:gap-3"
              >
                <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-lg transition " + c.chip}>
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <span className={"min-w-0 font-semibold leading-snug text-slate-900 " + c.title}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* „Последно от общината“ — само ако има публикувани новини. */}
      <LatestNews />

      {/* Абониране — ненатрапчива лента към известията (и Viber, ако го има). */}
      <section aria-label="Известия на телефона" className="container-content pb-10">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4">
          <p className="min-w-[14rem] flex-1 text-lg text-slate-800">
            Искате ли да ви казваме, когато спира токът или има нова измама?
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/izvestiya" className="btn-secondary min-h-[44px]">
              Включете известията
            </Link>
            {viberUrl && <ViberButton url={viberUrl} />}
          </div>
        </div>
      </section>

      {/* Рекламни банери (4 слота) */}
      <Section title="Реклама" href="/reklama" hrefLabel="Рекламирайте при нас" tone="muted">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bannerSlots.map((b, i) =>
            b ? (
              <BannerCard
                key={b.id}
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
              <BannerEmptySlot key={`empty-${i}`} />
            ),
          )}
        </div>
      </Section>

      {/* Популярни „Как да“ */}
      <Section title="Популярни въпроси „Как да…“" href="/kak-da">
        {topFaqs.length === 0 ? (
          <EmptyState title="Скоро тук ще има полезни въпроси и отговори." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {topFaqs.map((f) => (
              <Link key={f.id} href={`/kak-da/${f.slug}`} className="card">
                <div className="badge">{f.category}</div>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">
                  {f.question}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {plainText(f.answer, 120)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* Събития и обяви — показват се само ако има какво (по брой, както
          „Местен бизнес“). Празен раздел → лента „Помогнете ни да я напълним“. */}
      {(events.length > 0 || listings.length > 0) && (
        <div className="bg-white">
          <div
            className={
              "container-content grid gap-10 py-10" +
              (events.length > 0 && listings.length > 0 ? " lg:grid-cols-2" : "")
            }
          >
            {events.length > 0 && (
              <div>
                <div className="mb-5 flex items-end justify-between">
                  <h2 className="text-2xl font-bold">Предстоящи събития</h2>
                  <Link href="/sabitiya" className="text-sm font-medium text-brand-700">
                    Всички →
                  </Link>
                </div>
                <ul className="space-y-3">
                  {events.map((e) => (
                    <li key={e.id}>
                      <Link href={`/sabitiya/${e.slug}`} className="card block">
                        <div className="text-sm font-medium text-brand-700">
                          {formatDate(e.startAt)}
                        </div>
                        <div className="text-lg font-semibold">{e.title}</div>
                        {e.location && (
                          <div className="text-sm text-slate-600">{e.location}</div>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {listings.length > 0 && (
              <div>
                <div className="mb-5 flex items-end justify-between">
                  <h2 className="text-2xl font-bold">Последни обяви</h2>
                  <Link href="/obyavi" className="text-sm font-medium text-brand-700">
                    Всички →
                  </Link>
                </div>
                <ul className="space-y-3">
                  {listings.map((l) => (
                    <li key={l.id}>
                      <Link href={`/obyavi/${l.slug}`} className="card block">
                        <div className="text-lg font-semibold">{l.title}</div>
                        <p className="text-sm text-slate-600">
                          {plainText(l.description, 100)}
                        </p>
                        {l.price && (
                          <div className="mt-1 font-semibold text-brand-700">
                            {l.price}
                          </div>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
      {(events.length === 0 || listings.length === 0) && (
        <FillStrip events={events.length === 0} listings={listings.length === 0} />
      )}

      {/* Местен бизнес */}
      {businesses.length > 0 && (
        <Section title="Местен бизнес" href="/biznes" tone="muted">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {businesses.map((b) => (
              <Link key={b.id} href={`/biznes/${b.slug}`} className="card">
                <div className="text-lg font-semibold text-slate-900">{b.name}</div>
                {b.address && (
                  <div className="mt-1 text-sm text-slate-600">{b.address}</div>
                )}
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* Помощ онлайн + взаимопомощ */}
      <section className="bg-brand-50">
        <div className="container-content grid items-center gap-6 py-12 sm:grid-cols-[2fr,1fr]">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Не се справяте онлайн? Помагаме безплатно.
            </h2>
            <p className="mt-2 max-w-2xl text-slate-700">
              Питайте дигиталния помощник долу вдясно или вижте обясненията{" "}
              „Как да…“ — стъпка по стъпка, на разбираем език, за всички възрасти.
              А ако възрастен човек се нуждае от подкрепа, вижте „Зов за помощ“.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
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
        <div className="flex flex-wrap gap-2">
          {Object.entries(SERVICE_CATEGORY_LABELS).map(([key, label]) => (
            <Link
              key={key}
              href={`/uslugi?cat=${key}`}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700"
            >
              {label}
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
