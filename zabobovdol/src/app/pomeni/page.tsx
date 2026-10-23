import Link from "next/link";
import type { Metadata } from "next";
import { PageHero, EmptyState } from "@/components/ui";
import { Phone } from "@/components/icons";
import { buildMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";
import {
  KIND_INFO,
  OBITUARY_KINDS,
  ceremonyLine,
  friendlyPhone,
  kindInfo,
  parseKindFilter,
  parsePage,
  relativeDayLabel,
  safePhotoUrl,
  yearsLabel,
  type ObituaryKind,
} from "@/lib/obituary";
import { listPublishedObituaries, purgeExpiredObituaryContacts } from "@/lib/obituary-store";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const KEYWORDS = [
  "некролози Бобов дол",
  "помени Бобов дол",
  "възпоменания Бобов дол",
  "тъжна вест Бобов дол",
  "погребение Бобов дол",
  "Carbon Stealth",
];

// Индексира се само първата страница без филтър — „кой почина наскоро“ се
// търси, но архивът с имена не е нужно да виси в търсачките (минимизация).
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = parseKindFilter(sp.vid) !== null || parsePage(sp.str) > 1;
  return {
    ...buildMetadata({
      title: "Некролози и помени — Бобов дол",
      description:
        "Тъжни вести и възпоменания (40 дни, 6 месеца, година) от Бобов дол, подадени от близките. Кога и къде е погребението или поменът.",
      path: "/pomeni",
      noindex: filtered,
    }),
    keywords: KEYWORDS,
  };
}

function href(kind: ObituaryKind | null, page = 1): string {
  const q = new URLSearchParams();
  if (kind) q.set("vid", KIND_INFO[kind].filter);
  if (page > 1) q.set("str", String(page));
  const s = q.toString();
  return s ? `/pomeni?${s}` : "/pomeni";
}

export default async function ObituariesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const kind = parseKindFilter(sp.vid);
  const page = parsePage(sp.str);

  await purgeExpiredObituaryContacts();
  const { items, hasMore } = await listPublishedObituaries({ kind, page });
  const now = new Date();
  const phone = friendlyPhone(SITE.contact.phone);

  const filters: { kind: ObituaryKind | null; label: string }[] = [
    { kind: null, label: "Всички" },
    ...OBITUARY_KINDS.map((k) => ({ kind: k, label: KIND_INFO[k].plural })),
  ];

  return (
    <>
      <PageHero
        title="Некролози и помени"
        intro="Тъжни вести и възпоменания от Бобов дол, подадени от близките. Всяка обява се преглежда, преди да се появи тук."
        crumbs={[{ name: "Некролози и помени", path: "/pomeni" }]}
      />
      <div className="container-content py-10">
        <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
          <nav aria-label="Покажи" className="flex flex-wrap gap-2">
            {filters.map((f) => {
              const active = f.kind === kind;
              // Активният е подчертан — различим и в тъмен режим, не само по цвят.
              return (
                <Link
                  key={f.label}
                  href={href(f.kind)}
                  aria-current={active ? "page" : undefined}
                  className={
                    "btn-secondary " +
                    (active
                      ? "border-slate-700 bg-slate-100 text-slate-900 underline decoration-2 underline-offset-4"
                      : "")
                  }
                >
                  {f.label}
                </Link>
              );
            })}
          </nav>
          <Link href="/pomeni/nov" className="btn-primary">
            + Подайте некролог или помен
          </Link>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title={page > 1 ? "Няма повече обяви." : "Засега няма публикувани обяви."}
            hint={`Близките могат да подадат некролог или помен през формата или на телефон ${phone}.`}
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {items.map((o) => {
              const info = kindInfo(o.kind);
              const years = yearsLabel(o.birthYear, o.deathDate);
              const line = ceremonyLine(o.kind, o.ceremonyAt, o.ceremonyPlace);
              const when = relativeDayLabel(o.ceremonyAt, now);
              const photo = safePhotoUrl(o.photoUrl);
              return (
                <li key={o.id}>
                  <Link
                    href={`/pomeni/${o.slug}`}
                    className="card flex h-full gap-4 hover:translate-y-0"
                  >
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo}
                        alt=""
                        className="h-24 w-20 shrink-0 rounded-lg border border-slate-200 object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                        {info.heading}
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-slate-900">{o.fullName}</h2>
                      {years && <p className="text-base text-slate-700">{years}</p>}
                      {line && (
                        <p className="mt-2 text-base text-slate-700">
                          {when && (
                            <span className="mr-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-semibold text-slate-800">
                              {when}
                            </span>
                          )}
                          {line}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {(page > 1 || hasMore) && (
          <nav aria-label="Страници" className="no-print mt-8 flex flex-wrap justify-between gap-3">
            {page > 1 ? (
              <Link href={href(kind, page - 1)} className="btn-secondary">
                ← По-нови
              </Link>
            ) : (
              <span />
            )}
            {hasMore && (
              <Link href={href(kind, page + 1)} className="btn-secondary">
                По-стари →
              </Link>
            )}
          </nav>
        )}

        <section className="mt-10 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Как да подадете обява</h2>
          <p className="mt-2 text-base text-slate-700">
            Попълнете{" "}
            <Link href="/pomeni/nov" className="font-semibold text-brand-700 underline underline-offset-2">
              формата
            </Link>{" "}
            или се обадете — ще запишем обявата вместо вас. Подават само близки. Преди да
            я публикуваме, ще ви се обадим за проверка.
          </p>
          <p className="mt-3 text-base text-slate-700">
            Искате да поправим или свалим обява? Обадете се или пишете — сваляме я до 72
            часа.
          </p>
          <div className="no-print mt-4 flex flex-wrap gap-3">
            <a href={`tel:${SITE.contact.phone}`} className="btn-secondary">
              <Phone className="h-5 w-5" aria-hidden />
              {phone}
            </a>
            <a href={`mailto:${SITE.contact.email}`} className="btn-secondary">
              {SITE.contact.email}
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
