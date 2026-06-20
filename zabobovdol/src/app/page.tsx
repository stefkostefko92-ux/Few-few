import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SITE, PRIMARY_NAV } from "@/lib/site";
import { SearchBar } from "@/components/SearchBar";
import { Section, EmptyState } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { faqPageLd } from "@/lib/seo";
import { plainText } from "@/lib/markdown";
import { SERVICE_CATEGORY_LABELS } from "@/lib/categories";
import { BannerCard, BannerEmptySlot } from "@/components/BannerCard";
import { ScamBanner } from "@/components/ScamBanner";
import { WeatherWidget } from "@/components/WeatherWidget";
import { TodayCalendar } from "@/components/TodayCalendar";
import {
  HelpCircle,
  Phone,
  Store,
  CalendarDays,
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
  "/danaci-srokove": Coins,
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
};

// Цветова тема за всяка категория — за по-лесно разпознаване и по-жив вид.
// Ползваме нюанси -100/-700, които НЕ се променят в тъмен режим (остават
// като цветни „значки" на тъмните карти).
const NAV_COLOR: Record<string, string> = {
  "/kak-da": "blue", "/uslugi": "sky", "/novini": "blue",
  "/izmami": "rose", "/signali": "rose", "/zov-za-pomosht": "rose", "/sabitiya": "rose",
  "/dezhurna-apteka": "green", "/smetishta": "green", "/grafik-smetosabirane": "green",
  "/pomoshti": "amber", "/evroto": "amber", "/prekysvaniya": "amber", "/istoriya": "amber", "/danaci-srokove": "amber",
  "/biznes": "purple", "/spomeni": "purple", "/galeriya": "purple", "/imen-den": "purple",
  "/obyavi": "orange",
  "/transport": "sky",
  "/prozrachnost": "teal", "/grada": "teal", "/dobrovolci": "teal",
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

export default async function HomePage() {
  const [topFaqs, emergency, events, listings, businesses, banners] = await Promise.all([
    prisma.faq.findMany({
      where: { published: true },
      orderBy: [{ order: "asc" }, { views: "desc" }],
      take: 6,
    }),
    prisma.service.findMany({
      where: { published: true, isEmergency: true },
      orderBy: { order: "asc" },
      take: 6,
    }),
    prisma.event.findMany({
      where: { published: true, startAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      take: 3,
    }),
    prisma.listing.findMany({
      where: {
        published: true,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.business.findMany({
      where: { published: true, featured: true },
      orderBy: { order: "asc" },
      take: 4,
    }),
    prisma.banner.findMany({
      where: { published: true },
      orderBy: { order: "asc" },
      take: 4,
    }),
  ]);

  // Винаги показваме 4 слота: запълнените с реклами, останалите — покана.
  const bannerSlots = Array.from({ length: 4 }, (_, i) => banners[i] ?? null);

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
      <section className="border-b border-slate-200 bg-amber-50">
        <div className="container-content flex flex-wrap items-center gap-x-6 gap-y-2 py-3 text-sm">
          <span className="font-semibold text-amber-900">Спешни телефони:</span>
          <a href="tel:112" className="font-bold text-amber-900 hover:underline">
            Спешност 112
          </a>
          {emergency
            .filter((s) => s.phone !== "112")
            .map((s) => (
              <a
                key={s.id}
                href={`tel:${s.phone}`}
                className="text-amber-900 hover:underline"
              >
                {s.name.includes(s.phone) ? s.name : `${s.name} ${s.phone}`}
              </a>
            ))}
        </div>
      </section>

      {/* Време и календар (днешен имен ден/празник) */}
      <div className="container-content grid gap-4 pt-6 md:grid-cols-2">
        <WeatherWidget />
        <TodayCalendar />
      </div>

      {/* Бързи раздели */}
      <Section title="Какво търсите днес?">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRIMARY_NAV.map((item) => {
            const Icon = NAV_ICONS[item.href] ?? HelpCircle;
            const c = COLOR[NAV_COLOR[item.href] ?? "blue"];
            return (
              <Link key={item.href} href={item.href} className="card group flex items-start gap-4">
                <span className={"grid h-12 w-12 shrink-0 place-items-center rounded-xl transition duration-200 group-hover:scale-110 " + c.chip}>
                  <Icon className="h-7 w-7" aria-hidden />
                </span>
                <span>
                  <span className={"block font-display text-lg font-bold text-slate-900 " + c.title}>
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-600">{item.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* Рекламни банери (4 слота) */}
      <Section title="Реклама" href="/reklama" hrefLabel="Рекламирайте при нас">
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

      {/* Събития и обяви */}
      <div className="bg-white">
        <div className="container-content grid gap-10 py-10 lg:grid-cols-2">
          <div>
            <div className="mb-5 flex items-end justify-between">
              <h2 className="text-2xl font-bold">Предстоящи събития</h2>
              <Link href="/sabitiya" className="text-sm font-medium text-brand-700">
                Всички →
              </Link>
            </div>
            {events.length === 0 ? (
              <EmptyState title="Няма обявени събития в момента." />
            ) : (
              <ul className="space-y-3">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/sabitiya/${e.slug}`}
                      className="card block"
                    >
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
            )}
          </div>

          <div>
            <div className="mb-5 flex items-end justify-between">
              <h2 className="text-2xl font-bold">Последни обяви</h2>
              <Link href="/obyavi" className="text-sm font-medium text-brand-700">
                Всички →
              </Link>
            </div>
            {listings.length === 0 ? (
              <EmptyState
                title="Още няма обяви."
                hint="Бъдете първите — публикувайте безплатна обява."
              />
            ) : (
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
            )}
          </div>
        </div>
      </div>

      {/* Местен бизнес */}
      {businesses.length > 0 && (
        <Section title="Местен бизнес" href="/biznes">
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
