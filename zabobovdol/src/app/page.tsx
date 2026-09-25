import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PRIMARY_NAV, MAIN_SIGNS, DIRECTORY } from "@/lib/site";
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
import { HelpCircle, Phone, ShieldAlert, type LucideIcon } from "@/components/icons";

const SIGN_ICONS: Record<string, LucideIcon> = {
  "/uslugi": Phone,
  "/kak-da": HelpCircle,
  "/izmami": ShieldAlert,
};
const NAV_BY_HREF = new Map(PRIMARY_NAV.map((n) => [n.href, n]));

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

      {/* Начало: въпросът, търсачката и трите посоки. Това е единственото
          „смело“ място на сайта — табелите; всичко по-долу е тих указател. */}
      <section className="border-b border-slate-300 bg-white">
        <div className="container-content py-10 sm:py-14">
          <h1 className="max-w-3xl text-4xl text-slate-900 sm:text-6xl">
            Какво търсите в Бобов дол?
          </h1>
          <p className="mt-4 max-w-[60ch] text-lg text-slate-700">
            Телефони и услуги, обяснения стъпка по стъпка, събития, обяви и
            взаимопомощ. Направено от местни хора, на разбираем език.
          </p>
          <div className="mt-6 max-w-2xl">
            <SearchBar />
          </div>
          <Link
            href="/kak-da-polzvam-sayta"
            className="more-link mt-3 inline-block"
          >
            Нов тук? Вижте как да ползвате сайта
          </Link>

          <ul className="mt-9 grid gap-4 md:grid-cols-3">
            {MAIN_SIGNS.map((href) => {
              const item = NAV_BY_HREF.get(href);
              if (!item) return null;
              const Icon = SIGN_ICONS[href] ?? HelpCircle;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className="sign flex h-full min-h-[9.5rem] flex-col justify-between gap-4 p-6"
                  >
                    <Icon className="h-9 w-9" aria-hidden />
                    <span>
                      <span className="block font-cond text-3xl font-bold leading-tight">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-base text-brand-100">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Спешни телефони — червеното е само тук и в табелата 112 горе. */}
      <section className="border-b border-slate-300" aria-labelledby="speshni">
        <div className="container-content flex flex-wrap items-center gap-x-5 gap-y-3 py-4">
          <h2 id="speshni" className="text-xl text-slate-900">
            Спешни телефони
          </h2>
          <a
            href="tel:112"
            className="sign-alert a11y-btn inline-flex items-center px-4 py-2 font-cond text-xl font-bold"
          >
            Спешност 112
          </a>
          {emergency
            .filter((s) => s.phone !== "112")
            .map((s) => (
              <a
                key={s.id}
                href={`tel:${s.phone}`}
                className="a11y-btn inline-flex items-center text-lg font-semibold text-slate-900 underline decoration-slate-400 decoration-2 underline-offset-4 hover:decoration-slate-900"
              >
                {s.name.includes(s.phone) ? s.name : `${s.name} ${s.phone}`}
              </a>
            ))}
        </div>
      </section>

      {/* Днес: време и календар (имен ден/празник) */}
      <div className="container-content grid gap-4 pt-8 md:grid-cols-2">
        <WeatherWidget />
        <TodayCalendar />
      </div>

      {/* Указател: всички раздели в групи, като указателя във фоайето на
          общината — име и какво има там, без плочки с икони. */}
      <div id="ukazatel" className="scroll-mt-24">
        <Section title="Указател">
          <div className="columns-1 gap-x-12 md:columns-2 lg:columns-3">
            {DIRECTORY.map((group) => (
              <section key={group.title} className="mb-8 break-inside-avoid">
                <h3 className="border-b-2 border-slate-900 pb-1 text-xl text-slate-900">
                  {group.title}
                </h3>
                <ul>
                  {group.hrefs.map((href) => {
                    const item = NAV_BY_HREF.get(href);
                    if (!item) return null;
                    return (
                      <li key={href}>
                        <Link href={href} className="dir-row">
                          <span className="dir-row-title">{item.label}</span>
                          {item.description && (
                            <span className="mt-0.5 block text-base text-slate-600">
                              {item.description}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </Section>
      </div>

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
      <Section title="Най-търсени обяснения" href="/kak-da" hrefLabel="Всички обяснения">
        {topFaqs.length === 0 ? (
          <EmptyState title="Скоро тук ще има полезни въпроси и отговори." />
        ) : (
          <ul className="grid gap-x-12 md:grid-cols-2">
            {topFaqs.map((f) => (
              <li key={f.id}>
                <Link href={`/kak-da/${f.slug}`} className="dir-row">
                  <span className="block text-sm font-medium text-slate-600">
                    {f.category}
                  </span>
                  <span className="dir-row-title">{f.question}</span>
                  <span className="mt-0.5 block text-base text-slate-600">
                    {plainText(f.answer, 110)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Събития и обяви */}
      <div className="border-y border-slate-300 bg-white">
        <div className="container-content grid gap-10 py-10 lg:grid-cols-2">
          <section>
            <div className="section-head">
              <h2 className="section-title">Предстоящи събития</h2>
              <Link href="/sabitiya" className="more-link">
                Всички събития
              </Link>
            </div>
            {events.length === 0 ? (
              <EmptyState title="Няма обявени събития в момента." />
            ) : (
              <ul>
                {events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/sabitiya/${e.slug}`} className="dir-row">
                      <span className="block text-base font-semibold text-slate-700">
                        {formatDate(e.startAt)}
                      </span>
                      <span className="dir-row-title">{e.title}</span>
                      {e.location && (
                        <span className="block text-base text-slate-600">{e.location}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="section-head">
              <h2 className="section-title">Последни обяви</h2>
              <Link href="/obyavi" className="more-link">
                Всички обяви
              </Link>
            </div>
            {listings.length === 0 ? (
              <EmptyState
                title="Още няма обяви."
                hint="Публикувайте първата — обявите са безплатни."
              />
            ) : (
              <ul>
                {listings.map((l) => (
                  <li key={l.id}>
                    <Link href={`/obyavi/${l.slug}`} className="dir-row">
                      <span className="dir-row-title">{l.title}</span>
                      <span className="block text-base text-slate-600">
                        {plainText(l.description, 100)}
                      </span>
                      {l.price && (
                        <span className="mt-1 block font-semibold text-slate-900">
                          {l.price}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Местен бизнес */}
      {businesses.length > 0 && (
        <Section title="Местен бизнес" href="/biznes" hrefLabel="Целият каталог">
          <ul className="grid gap-x-12 sm:grid-cols-2">
            {businesses.map((b) => (
              <li key={b.id}>
                <Link href={`/biznes/${b.slug}`} className="dir-row">
                  <span className="dir-row-title">{b.name}</span>
                  {b.address && (
                    <span className="block text-base text-slate-600">{b.address}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Помощ онлайн + взаимопомощ */}
      <section className="border-y border-slate-300 bg-white">
        <div className="container-content grid items-center gap-6 py-10 sm:grid-cols-[2fr,1fr]">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Не се справяте онлайн? Помагаме безплатно.
            </h2>
            <p className="mt-2 max-w-2xl text-slate-700">
              Питайте помощника долу вдясно или отворете обясненията „Как да…“ —
              стъпка по стъпка, на разбираем език. Ако възрастен човек има нужда
              от помощ у дома, вижте „Зов за помощ“.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <Link href="/kak-da" className="btn-primary">
              Отворете „Как да…“
            </Link>
            <Link href="/zov-za-pomosht" className="btn-secondary">
              Зов за помощ
            </Link>
          </div>
        </div>
      </section>

      {/* Бърз достъп до категории услуги (помага за GEO/AEO) */}
      <Section title="Услуги по категории" href="/uslugi" hrefLabel="Всички услуги">
        <div className="flex flex-wrap gap-2">
          {Object.entries(SERVICE_CATEGORY_LABELS).map(([key, label]) => (
            <Link
              key={key}
              href={`/uslugi?cat=${key}`}
              className="inline-flex min-h-[44px] items-center rounded-md border border-slate-400 bg-white px-4 py-2 text-base font-medium text-slate-900 hover:border-brand-800 hover:text-brand-800"
            >
              {label}
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
