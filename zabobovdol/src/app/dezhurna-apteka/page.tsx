import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cross, MapPin, Clock, type LucideIcon } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, Prose, SectionHeader } from "@/components/ui";
import { PhoneButton } from "@/components/PhoneButton";
import { isDialablePhone } from "@/lib/phone";
import { SECTION } from "@/lib/section-names";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, itemListLd, localBusinessLd, canonical } from "@/lib/seo";
import { renderMarkdown } from "@/lib/markdown";
import { getDutyInfo } from "@/lib/settings";
import { getDutySchedule, type DutyEntry } from "@/lib/duty-db";
import { dutyDayLabel } from "@/lib/duty";
import { PrintButton } from "@/components/PrintButton";
import { OpenNowBadge } from "@/components/OpenNowBadge";
import { ShareButton } from "@/components/ShareButton";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { PhoneReportButton, TelLink } from "@/components/PhoneReportButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Дежурна аптека и лекар в Бобов дол",
    description:
      "Коя аптека е дежурна в момента и кои са телефоните на аптеките и лекарите в Бобов дол — работно време и адреси на едно място.",
    path: "/dezhurna-apteka",
  }),
  keywords: [
    "дежурна аптека Бобов дол",
    "дежурна аптека днес",
    "аптека Бобов дол",
    "лекар Бобов дол",
    "аптеки телефон Бобов дол",
    "Carbon Stealth",
  ],
};

const isPharmacy = (name: string) => /аптек/i.test(name);

// Ред с икона и текст: иконата стои на първия ред, текстът се пренася под
// себе си (не под иконата) — B21.
function InfoRow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-1 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

type Place = {
  id: string;
  name: string;
  description: string;
  address: string;
  hours: string;
  phone: string;
  phone2?: string;
  href?: string;
};

// Аптека / лекар: име, описание, адрес, работно време („Отворено сега“) и
// телефонът като бутон — най-ясното действие на тази страница.
function PlaceCard({ p, children }: { p: Place; children?: ReactNode }) {
  return (
    <li className="panel flex flex-col gap-3">
      <div>
        <h3 className="h-card">
          {p.href ? (
            <Link href={p.href} className="link-quiet">
              {p.name}
            </Link>
          ) : (
            p.name
          )}
        </h3>
        {p.description && <p className="mt-1 text-base text-slate-600">{p.description}</p>}
      </div>
      {(p.address || p.hours) && (
        <div className="space-y-1.5 text-base text-slate-700">
          {p.address && (
            <InfoRow icon={MapPin}>
              <span>{p.address}</span>
            </InfoRow>
          )}
          {p.hours && (
            <InfoRow icon={Clock}>
              <span>{p.hours}</span>
              <div className="mt-1 empty:hidden">
                <OpenNowBadge hours={p.hours} />
              </div>
            </InfoRow>
          )}
        </div>
      )}
      {(p.phone || p.phone2) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {p.phone && <PhoneButton phone={p.phone} label="Обадете се:" />}
          {p.phone2 && <PhoneButton phone={p.phone2} />}
        </div>
      )}
      {children}
    </li>
  );
}

export default async function DutyPharmacyPage() {
  const [duty, dutyInfo, health, healthBusinesses] = await Promise.all([
    getDutySchedule(),
    getDutyInfo(),
    prisma.service.findMany({
      where: { published: true, category: "HEALTH" },
      orderBy: { order: "asc" },
    }),
    // Някои аптеки са заведени като местен бизнес, не като услуга — без тях
    // списъкът на аптеките е непълен.
    prisma.business.findMany({
      where: { published: true, category: "HEALTH" },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
  ]);

  const pharmacies = health.filter((s) => isPharmacy(s.name));
  const others = health.filter((s) => !isPharmacy(s.name));
  const serviceNames = new Set(pharmacies.map((s) => s.name.trim().toLowerCase()));
  const businessPharmacies = healthBusinesses.filter(
    (b) => isPharmacy(b.name) && !serviceNames.has(b.name.trim().toLowerCase()),
  );

  const serviceCard = (s: (typeof health)[number]) => (
    <PlaceCard
      key={s.id}
      p={{
        id: s.id,
        name: s.name,
        description: s.description,
        address: s.address,
        hours: s.hours,
        phone: s.phone,
        phone2: s.phone2,
      }}
    >
      {(s.phone || s.phone2) && (
        <div>
          <VerifiedBadge at={s.verifiedAt} source={s.verifiedSource} />
          <PhoneReportButton serviceId={s.id} serviceName={s.name} className="mt-1" />
        </div>
      )}
    </PlaceCard>
  );

  const businessCard = (b: (typeof healthBusinesses)[number]) => (
    <PlaceCard
      key={b.id}
      p={{
        id: b.id,
        name: b.name,
        description: b.description,
        address: b.address,
        hours: b.hours,
        phone: b.phone,
        href: `/biznes/${b.slug}`,
      }}
    />
  );

  // Днешното дежурство — едро, с голям бутон за обаждане.
  const dutyCard = (e: DutyEntry) => (
    <li key={e.id} className="panel">
      <h3 className="font-sans text-xl font-bold text-slate-900">{e.pharmacy}</h3>
      <div className="mt-2 space-y-1.5 text-base text-slate-700">
        {e.address && (
          <InfoRow icon={MapPin}>
            <span>{e.address}</span>
          </InfoRow>
        )}
        {e.hours && (
          <InfoRow icon={Clock}>
            <span>{e.hours}</span>
          </InfoRow>
        )}
        {e.note && <p className="text-slate-700">{e.note}</p>}
      </div>
      {e.phone && (
        <PhoneButton phone={e.phone} label="Обадете се:" variant="primary" full className="mt-4" />
      )}
    </li>
  );

  // Телефоните на аптеките — веднага под „няма обявена дежурна аптека“.
  const pharmacyPhones = [
    ...pharmacies.map((s) => ({ id: s.id, name: s.name, phone: s.phone })),
    ...businessPharmacies.map((b) => ({ id: b.id, name: b.name, phone: b.phone })),
  ].filter((x) => /\d/.test(x.phone) && isDialablePhone(x.phone));

  const allPharmacies = pharmacies.length + businessPharmacies.length;
  const shareText =
    duty.today.length > 0
      ? `Дежурна аптека днес в Бобов дол: ${duty.today.map((e) => e.pharmacy).join(", ")}`
      : "Дежурна аптека и телефоните на аптеките в Бобов дол";

  return (
    <>
      {health.length > 0 && (
        <JsonLd
          data={itemListLd(
            health.map((s) => ({ name: s.name, path: `/uslugi/${s.slug}` })),
            "Аптеки и здравни услуги в Бобов дол",
          )}
        />
      )}
      {/* Всяка аптека като Pharmacy (LocalBusiness) — пряк локален AEO сигнал
          за въпроси „коя аптека работи сега“. */}
      {allPharmacies > 0 && (
        <JsonLd
          data={[
            ...pharmacies.map((s) =>
              localBusinessLd({
                schemaType: "Pharmacy",
                name: s.name,
                description: s.description || undefined,
                address: s.address || undefined,
                phone: s.phone || undefined,
                url: canonical(`/uslugi/${s.slug}`),
                hours: s.hours || undefined,
                lat: s.lat,
                lng: s.lng,
              }),
            ),
            ...businessPharmacies.map((b) =>
              localBusinessLd({
                schemaType: "Pharmacy",
                name: b.name,
                description: b.description || undefined,
                address: b.address || undefined,
                phone: b.phone || undefined,
                url: canonical(`/biznes/${b.slug}`),
                hours: b.hours || undefined,
                lat: b.lat,
                lng: b.lng,
              }),
            ),
          ]}
        />
      )}
      <PageHero
        eyebrow={SECTION.health}
        title="Дежурна аптека и лекар"
        intro="Коя аптека е дежурна днес и в следващите дни, плюс телефоните на аптеките и лекарите в Бобов дол."
        crumbs={[{ name: "Дежурна аптека", path: "/dezhurna-apteka" }]}
      />

      <div className="container-content space-y-12 py-10">
        {/* Дежурството днес — от графика (админ → „Дежурни аптеки (график)“). */}
        <section
          aria-labelledby="duty-today-title"
          className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <span className="icon-chip bg-white">
              <Cross aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id="duty-today-title" className="text-2xl font-bold text-slate-900">
                Дежурна аптека днес
              </h2>
              <p className="text-base text-slate-700">{dutyDayLabel(duty.day, duty.day)}</p>
            </div>
          </div>

          {duty.today.length > 0 ? (
            <>
              <ul role="list" className="mt-5 grid gap-4 sm:grid-cols-2">
                {duty.today.map(dutyCard)}
              </ul>
              {duty.upcoming.length === 0 && (
                <p className="mt-3 text-base text-slate-600">
                  Графикът за следващите дни още не е въведен.
                </p>
              )}
            </>
          ) : (
            <div className="mt-5">
              {/* Без график за днес „няма обявена“ е вярно само ако няма и
                  свободния текст от админа („Текущо дежурство“) — иначе двете
                  съобщения си противоречат на здравна страница. */}
              {dutyInfo ? (
                <>
                  <p className="text-lg font-semibold text-slate-900">
                    Графикът за днес не е въведен — последната обявена информация:
                  </p>
                  <div className="mt-2 text-lg">
                    <Prose html={renderMarkdown(dutyInfo)} />
                  </div>
                </>
              ) : (
                <p className="text-lg font-semibold text-slate-900">
                  Няма обявена дежурна аптека за днес.
                </p>
              )}
              {pharmacyPhones.length > 0 ? (
                <>
                  <p className="mt-3 text-base text-slate-700">
                    Обадете се на аптеката, за да проверите дали работи:
                  </p>
                  <ul role="list" className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {pharmacyPhones.map((x) => (
                      <li key={x.id}>
                        <PhoneButton phone={x.phone} label={`${x.name}:`} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-base text-slate-700">
                  Вижте аптеките по-долу и се обадете предварително.
                </p>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 border-t border-brand-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-base text-slate-700">
              При спешен здравословен проблем се обадете на{" "}
              <TelLink phone="112" className="font-bold text-crimson-700 underline underline-offset-2">
                112
              </TelLink>
              .
            </p>
            <ShareButton
              title="Дежурна аптека — За Бобов дол"
              text={shareText}
              path="/dezhurna-apteka"
            />
          </div>
        </section>

        {/* Следващите дни от графика: ден | аптека и адрес | телефон */}
        {duty.upcoming.length > 0 && (
          <section aria-labelledby="duty-next-title">
            <SectionHeader id="duty-next-title" title="Дежурни аптеки в следващите дни" />
            <ul role="list" className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {duty.upcoming.map((day) =>
                day.entries.map((e, i) => (
                  <li
                    key={e.id}
                    className="grid gap-2 p-4 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                  >
                    <p className="text-base font-bold text-slate-900">
                      {i === 0 ? dutyDayLabel(day.date, duty.day) : <span className="sr-only">{dutyDayLabel(day.date, duty.day)}</span>}
                    </p>
                    <div className="min-w-0 text-base text-slate-700">
                      <p className="font-semibold text-slate-900">{e.pharmacy}</p>
                      {(e.address || e.hours) && (
                        <p className="text-slate-600">
                          {[e.address, e.hours].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    {e.phone && <PhoneButton phone={e.phone} />}
                  </li>
                )),
              )}
            </ul>
          </section>
        )}

        {/* Аптеки */}
        <section aria-labelledby="apteki-title">
          <SectionHeader id="apteki-title" title="Аптеки" />
          {allPharmacies === 0 ? (
            <EmptyState
              icon={Cross}
              title="Още не са добавени аптеки."
              hint="Скоро тук ще видите аптеките с телефони и работно време."
            />
          ) : (
            <ul role="list" className="grid gap-4 sm:grid-cols-2">
              {pharmacies.map(serviceCard)}
              {businessPharmacies.map(businessCard)}
            </ul>
          )}
        </section>

        {/* Лекари и здравни услуги */}
        {others.length > 0 && (
          <section aria-labelledby="lekari-title">
            <SectionHeader id="lekari-title" title="Лекари и здравни услуги" />
            <ul role="list" className="grid gap-4 sm:grid-cols-2">
              {others.map(serviceCard)}
            </ul>
          </section>
        )}

        <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PrintButton variant="secondary" label="Отпечатайте страницата" />
          <Link href="/uslugi?cat=HEALTH" className="link-more">
            Всички здравни услуги и телефони <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </>
  );
}
