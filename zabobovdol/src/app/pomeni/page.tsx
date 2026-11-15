import Link from "next/link";
import type { Metadata } from "next";
import { PageHero, EmptyState, FilterChips, ListToolbar } from "@/components/ui";
import { Mail, Plus } from "@/components/icons";
import { PhoneButton } from "@/components/PhoneButton";
import { buildMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { formatPhoneBg } from "@/lib/phone";
import {
  KIND_INFO,
  OBITUARY_KINDS,
  ceremonyLine,
  kindInfo,
  parseKindFilter,
  parsePage,
  relativeDayLabel,
  safePhotoUrl,
  yearsLabel,
  type ObituaryKind,
} from "@/lib/obituary";
import { listPublishedObituaries, purgeExpiredObituaryContacts } from "@/lib/obituary-store";
import { SECTION } from "@/lib/section-names";

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
  const phone = formatPhoneBg(SITE.contact.phone);
  const [emailUser, emailDomain] = SITE.contact.email.split("@");

  const filters: { kind: ObituaryKind | null; label: string }[] = [
    { kind: null, label: "Всички" },
    ...OBITUARY_KINDS.map((k) => ({ kind: k, label: KIND_INFO[k].plural })),
  ];

  return (
    <>
      <PageHero
        eyebrow={SECTION.community}
        title="Некролози и помени"
        intro="Тъжни вести и възпоменания от Бобов дол, подадени от близките. Всяка обява се преглежда, преди да се появи тук."
        crumbs={[{ name: "Некролози и помени", path: "/pomeni" }]}
      />
      <div className="container-content py-10">
        {/* Траурен тон: сивите чипове (tone="neutral"), без синьо и червено. */}
        <FilterChips
          items={filters.map((f) => ({
            href: href(f.kind),
            label: f.label,
            active: f.kind === kind,
          }))}
          label="Вид обява"
          tone="neutral"
          className="no-print mb-6"
        />
        <ListToolbar
          action={
            <Link href="/pomeni/nov" className="btn-primary">
              <Plus className="h-5 w-5" aria-hidden />
              Подайте некролог или помен
            </Link>
          }
          className="no-print"
        />

        {items.length === 0 ? (
          <EmptyState
            tone="neutral"
            title={page > 1 ? "Няма повече обяви." : "Засега няма публикувани обяви."}
            hint={`Близките могат да подадат некролог или помен през формата или на телефон ${phone}.`}
          />
        ) : (
          <ul role="list" className="grid gap-4 md:grid-cols-2">
            {items.map((o) => {
              const info = kindInfo(o.kind);
              const years = yearsLabel(o.birthYear, o.deathDate);
              const line = ceremonyLine(o.kind, o.ceremonyAt, o.ceremonyPlace);
              const when = relativeDayLabel(o.ceremonyAt, now);
              const photo = safePhotoUrl(o.photoUrl);
              return (
                <li key={o.id}>
                  <Link href={`/pomeni/${o.slug}`} className="card group flex h-full gap-4">
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo}
                        alt=""
                        className="h-24 w-20 shrink-0 rounded-xl border border-slate-200 object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="label-caps">{info.heading}</p>
                      <h2 className="h-card mt-1 text-xl group-hover:underline">{o.fullName}</h2>
                      {years && <p className="text-base text-slate-700">{years}</p>}
                      {line && (
                        <p className="mt-2 text-base text-slate-700">
                          {when && <span className="badge-neutral mr-2 font-semibold">{when}</span>}
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
                <span aria-hidden="true">←</span> По-нови
              </Link>
            ) : (
              <span />
            )}
            {hasMore && (
              <Link href={href(kind, page + 1)} className="btn-secondary">
                По-стари <span aria-hidden="true">→</span>
              </Link>
            )}
          </nav>
        )}

        <section
          aria-labelledby="kak-da-podadete"
          className="panel mt-12 max-w-3xl bg-slate-50 sm:p-6"
        >
          <h2 id="kak-da-podadete" className="h-card">
            Как да подадете обява
          </h2>
          <p className="mt-2 text-base text-slate-700">
            Попълнете{" "}
            <Link href="/pomeni/nov" className="link">
              формата
            </Link>{" "}
            или се обадете — ще запишем обявата вместо вас. Подават само близки. Преди да
            я публикуваме, ще ви се обадим за проверка.
          </p>
          <p className="mt-3 text-base text-slate-700">
            Искате да поправим или свалим обява? Обадете се или пишете — сваляме я до 72
            часа.
          </p>
          <div className="no-print mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <PhoneButton phone={SITE.contact.phone} />
            <a href={`mailto:${SITE.contact.email}`} className="btn-secondary w-full sm:w-auto">
              <Mail className="h-5 w-5 shrink-0" aria-hidden />
              <span className="[overflow-wrap:anywhere]">
                {emailUser}@<wbr />
                {emailDomain}
              </span>
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
