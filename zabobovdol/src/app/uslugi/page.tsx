import Link from "next/link";
import type { Metadata } from "next";
import type { Service } from "@prisma/client";
import { Clock, MapPin } from "@/components/icons";
import { OpenNowBadge, hoursText } from "@/components/OpenNowBadge";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, FilterChips, ListToolbar } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, itemListLd } from "@/lib/seo";
import { SERVICE_CATEGORY_LABELS, SERVICE_CATEGORY_ORDER, labelFor } from "@/lib/categories";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { PhoneButton } from "@/components/PhoneButton";
import { formatPhoneBg } from "@/lib/phone";
import { SECTION } from "@/lib/section-names";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Услуги и важни телефони в Бобов дол",
    description:
      "Указател с важни местни телефони и услуги в Бобов дол: здраве, администрация, комунални услуги, транспорт, социални и спешни телефони.",
    path: "/uslugi",
  }),
  keywords: [
    "телефони Бобов дол",
    "услуги Бобов дол",
    "важни телефони",
    "аптека Бобов дол",
    "община Бобов дол телефон",
    "Carbon Stealth",
  ],
};

// Редът на групите — SERVICE_CATEGORY_ORDER (спешното първо, общ с
// началната). Котвите (#zdrave…) са на латиница, за да се копират и споделят
// без %-кодиране.
const CATEGORY_ORDER = SERVICE_CATEGORY_ORDER;
const ANCHOR: Record<string, string> = {
  EMERGENCY: "speshni",
  HEALTH: "zdrave",
  ADMIN: "administratsiya",
  UTILITY: "komunalni",
  SOCIAL: "sotsialni",
  TRANSPORT: "transport",
  EDUCATION: "obrazovanie",
  OTHER: "drugo",
};
const rank = (cat: string) => {
  const i = (CATEGORY_ORDER as readonly string[]).indexOf(cat);
  return i === -1 ? CATEGORY_ORDER.length : i;
};

const isUrgent = (s: Service) => s.isEmergency || s.category === "EMERGENCY";

function servicesLabel(n: number): string {
  return `${n.toLocaleString("bg-BG")} ${n === 1 ? "услуга" : "услуги"}`;
}

function ServiceCard({ s }: { s: Service }) {
  return (
    <li className="card relative flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <h3 className="h-card">
          {/* Цялата карта е връзка към детайла (разтегнатата ::after), а
              телефонът отдолу е над нея (relative z-10) и си остава бутон. */}
          <Link
            href={`/uslugi/${s.slug}`}
            className="after:absolute after:inset-0 after:rounded-2xl hover:text-brand-700 hover:underline"
          >
            {s.name}
          </Link>
        </h3>
        {s.isEmergency && <span className="badge-danger shrink-0">Спешен номер</span>}
      </div>
      {s.address && (
        <p className="mt-2 flex items-start gap-1.5 text-base text-slate-700">
          <MapPin className="mt-1 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <span>{s.address}</span>
        </p>
      )}
      {s.hours && (
        <p className="mt-1 flex items-start gap-1.5 text-base text-slate-700">
          <Clock className="mt-1 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <span>{hoursText(s.hours)}</span>
        </p>
      )}
      <OpenNowBadge hours={s.hours} className="mt-2" />
      {s.phone && (
        // Бутонът е последен — така телефоните в един ред на мрежата са на
        // една линия, независимо дали има „Проверено на …“.
        <div className="relative z-10 mt-auto pt-4">
          <VerifiedBadge at={s.verifiedAt} source={s.verifiedSource} className="mb-2" />
          <PhoneButton
            phone={s.phone}
            variant={s.isEmergency ? "danger" : "secondary"}
            full
            aria-label={`Обадете се на ${s.name}: ${formatPhoneBg(s.phone)}`}
          />
        </div>
      )}
    </li>
  );
}

function Group({ cat, items }: { cat: string; items: Service[] }) {
  const id = ANCHOR[cat] ?? cat.toLowerCase();
  return (
    <section id={id} aria-labelledby={`${id}-zaglavie`}>
      <h2 id={`${id}-zaglavie`} className="section-title mb-6">
        {labelFor(SERVICE_CATEGORY_LABELS, cat)}{" "}
        <span className="font-sans text-lg font-normal text-slate-600">({items.length})</span>
      </h2>
      <ul role="list" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => (
          <ServiceCard key={s.id} s={s} />
        ))}
      </ul>
    </section>
  );
}

export default async function UslugiPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  // Object.hasOwn, не `in`: „?cat=constructor“ иначе минава (Object.prototype) и Prisma хвърля.
  const validCat = cat && Object.hasOwn(SERVICE_CATEGORY_LABELS, cat) ? cat : undefined;

  const [all, counts] = await Promise.all([
    prisma.service.findMany({
      where: {
        published: true,
        ...(validCat ? { category: validCat as never } : {}),
      },
      orderBy: [{ isEmergency: "desc" }, { order: "asc" }, { name: "asc" }],
    }),
    prisma.service.groupBy({
      by: ["category"],
      where: { published: true },
      _count: { _all: true },
    }),
  ]);
  // Групите в нашия ред (enum-ът в базата е по азбучен ред на английски).
  const services = [...all].sort((a, b) => rank(a.category) - rank(b.category));

  const countOf = new Map(counts.map((c) => [c.category as string, c._count._all]));
  const total = counts.reduce((n, c) => n + c._count._all, 0);
  // Празните категории не са чипове — не водят до „няма нищо“.
  const chips = [
    { href: "/uslugi", label: "Всички", active: !validCat, count: total },
    ...CATEGORY_ORDER.filter((k) => (countOf.get(k) ?? 0) > 0 || k === validCat).map((k) => ({
      href: `/uslugi?cat=${k}#rezultati`,
      label: SERVICE_CATEGORY_LABELS[k],
      active: validCat === k,
      count: countOf.get(k) ?? 0,
    })),
  ];

  // Без филтър спешните телефони са най-горе, в червена лента, а останалите —
  // по категории. С филтър — само избраната категория.
  const urgent = validCat ? [] : services.filter(isUrgent);
  const rest = validCat ? services : services.filter((s) => !isUrgent(s));
  const groups: { cat: string; items: Service[] }[] = [];
  for (const s of rest) {
    const last = groups[groups.length - 1];
    if (last && last.cat === s.category) last.items.push(s);
    else groups.push({ cat: s.category, items: [s] });
  }
  const catLabel = validCat ? labelFor(SERVICE_CATEGORY_LABELS, validCat) : "";

  return (
    <>
      {services.length > 0 && (
        <JsonLd
          data={itemListLd(
            services.slice(0, 50).map((s) => ({
              name: s.name,
              path: `/uslugi/${s.slug}`,
            })),
            "Услуги и важни телефони в Бобов дол",
          )}
        />
      )}
      <PageHero
        eyebrow={SECTION.directory}
        title="Услуги и важни телефони"
        intro="Намерете бързо телефон, адрес и работно време на важните услуги в града."
        crumbs={[{ name: "Услуги и телефони", path: "/uslugi" }]}
      />
      <div className="container-content py-10">
        {urgent.length > 0 && (
          <section aria-labelledby="speshno-zaglavie" className="callout-danger mb-8">
            <h2 id="speshno-zaglavie" className="h-card">
              Спешни телефони
            </h2>
            <p className="mt-1 text-base text-slate-800">
              При опасност за живота, пожар или престъпление звънете на 112 — безплатно и
              денонощно.
            </p>
            <ul role="list" className="mt-4 grid gap-4 sm:grid-cols-2">
              {urgent.map((s) => (
                <li key={s.id} className="flex flex-col gap-1">
                  <Link
                    href={`/uslugi/${s.slug}`}
                    className="link-quiet inline-flex min-h-tap w-fit items-center font-semibold text-slate-900"
                  >
                    {s.name}
                  </Link>
                  {s.phone && (
                    <PhoneButton
                      phone={s.phone}
                      variant={s.isEmergency ? "danger" : "secondary"}
                      full
                      aria-label={`Обадете се на ${s.name}: ${formatPhoneBg(s.phone)}`}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <FilterChips items={chips} label="Категории услуги" className="mb-6" />

        <div id="rezultati">
          {services.length === 0 ? (
            <EmptyState
              title={validCat ? `Няма услуги в „${catLabel}“.` : "Указателят се попълва."}
              hint="Знаете важен телефон, който липсва? Пишете ни и ще го добавим след проверка."
              action={
                <>
                  {validCat && (
                    <Link href="/uslugi" className="btn-primary">
                      Покажете всички услуги
                    </Link>
                  )}
                  <Link href="/kontakti" className="btn-secondary">
                    Пишете ни
                  </Link>
                </>
              }
            />
          ) : (
            <>
              <ListToolbar
                count={
                  validCat
                    ? `${servicesLabel(services.length)} в „${catLabel}“`
                    : servicesLabel(services.length)
                }
              />
              <div className="space-y-12">
                {groups.map((g) => (
                  <Group key={g.cat} cat={g.cat} items={g.items} />
                ))}
              </div>
              <p className="mt-10 max-w-3xl text-base text-slate-600">
                Видяхте грешен номер? Отворете услугата и натиснете „Този номер е сгрешен“ —
                ще го проверим и поправим.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
