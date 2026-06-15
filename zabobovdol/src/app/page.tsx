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
      where: { published: true },
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

      {/* Заглавна секция */}
      <section className="bg-gradient-to-b from-brand-700 to-brand-800 text-white">
        <div className="container-content py-14 sm:py-20">
          <p className="text-sm font-medium text-brand-100">
            {SITE.geo.city} · {SITE.geo.region}
          </p>
          <h1 className="mt-2 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {SITE.slogan}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-brand-50">
            Намерете бързо местни телефони и услуги, разберете как да свършите
            нещо онлайн, вижте събитията и обявите в града — лесно и на едно
            място.
          </p>
          <div className="mt-6 max-w-xl rounded-xl bg-white p-2 shadow-lg">
            <SearchBar />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {PRIMARY_NAV.slice(0, 5).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/20"
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
          {emergency.map((s) => (
            <a
              key={s.id}
              href={`tel:${s.phone}`}
              className="text-amber-900 hover:underline"
            >
              {s.name} {s.phone}
            </a>
          ))}
        </div>
      </section>

      {/* Бързи раздели */}
      <Section title="Какво търсите днес?">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRIMARY_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="card group">
              <div className="text-lg font-semibold text-slate-900 group-hover:text-brand-700">
                {item.label}
              </div>
              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
            </Link>
          ))}
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
