import Link from "next/link";
import type { Metadata } from "next";
import { Cross, Phone, MapPin, Clock, Stethoscope } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, Prose } from "@/components/ui";
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

  const card = (s: (typeof health)[number]) => (
    <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-display text-lg font-bold text-slate-900">{s.name}</h3>
      {s.description && <p className="mt-1 text-sm text-slate-600">{s.description}</p>}
      <div className="mt-3 space-y-1.5 text-sm text-slate-700">
        {s.address && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            <span>{s.address}</span>
          </div>
        )}
        {s.hours && (
          <div className="flex flex-wrap items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            <span>{s.hours}</span>
            <OpenNowBadge hours={s.hours} />
          </div>
        )}
        {s.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            <TelLink phone={s.phone} className="font-semibold text-brand-700 hover:underline">
              {s.phone}
            </TelLink>
            {s.phone2 && (
              <TelLink phone={s.phone2} className="text-brand-700 hover:underline">
                · {s.phone2}
              </TelLink>
            )}
          </div>
        )}
      </div>
      {(s.phone || s.phone2) && (
        <>
          <VerifiedBadge at={s.verifiedAt} source={s.verifiedSource} className="mt-2" />
          <PhoneReportButton serviceId={s.id} serviceName={s.name} className="mt-1" />
        </>
      )}
    </div>
  );

  const businessCard = (b: (typeof healthBusinesses)[number]) => (
    <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-display text-lg font-bold text-slate-900">
        <Link href={`/biznes/${b.slug}`} className="hover:text-brand-700 hover:underline">
          {b.name}
        </Link>
      </h3>
      {b.description && <p className="mt-1 text-sm text-slate-600">{b.description}</p>}
      <div className="mt-3 space-y-1.5 text-sm text-slate-700">
        {b.address && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            <span>{b.address}</span>
          </div>
        )}
        {b.hours && (
          <div className="flex flex-wrap items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            <span>{b.hours}</span>
            <OpenNowBadge hours={b.hours} />
          </div>
        )}
        {b.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            <TelLink phone={b.phone} className="font-semibold text-brand-700 hover:underline">
              {b.phone}
            </TelLink>
          </div>
        )}
      </div>
    </div>
  );

  // Днешното дежурство — едро, с голям бутон за обаждане.
  const dutyCard = (e: DutyEntry) => (
    <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-display text-xl font-bold text-slate-900">{e.pharmacy}</h3>
      <div className="mt-2 space-y-1.5 text-base text-slate-700">
        {e.address && (
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
            <span>{e.address}</span>
          </div>
        )}
        {e.hours && (
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
            <span>{e.hours}</span>
          </div>
        )}
        {e.note && <p className="text-slate-700">{e.note}</p>}
      </div>
      {e.phone && (
        <TelLink phone={e.phone} className="btn-primary mt-4">
          <Phone className="h-5 w-5" aria-hidden /> Обади се: {e.phone}
        </TelLink>
      )}
    </div>
  );

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
        eyebrow="Здраве"
        title="Дежурна аптека и лекар"
        intro="Коя аптека е дежурна днес и в следващите дни, плюс телефоните на аптеките и лекарите в Бобов дол."
        crumbs={[{ name: "Дежурна аптека", path: "/dezhurna-apteka" }]}
      />

      <div className="container-content space-y-10 py-10">
        {/* Дежурството днес — от графика (админ → „Дежурни аптеки (график)“). */}
        <section
          aria-labelledby="duty-today-title"
          className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-6"
        >
          <div className="flex items-center gap-2">
            <Cross className="h-6 w-6 text-crimson-600" aria-hidden />
            <h2 id="duty-today-title" className="text-2xl font-bold text-slate-900">
              Дежурна аптека днес
            </h2>
          </div>
          <p className="mt-1 text-base text-slate-700">{dutyDayLabel(duty.day, duty.day)}</p>

          {duty.today.length > 0 ? (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">{duty.today.map(dutyCard)}</div>
              {duty.upcoming.length === 0 && (
                <p className="mt-3 text-sm text-slate-600">
                  Графикът за следващите дни още не е въведен.
                </p>
              )}
            </>
          ) : (
            <div className="mt-3">
              <p className="text-lg font-semibold text-slate-900">
                Графикът на дежурствата за днес не е въведен.
              </p>
              {dutyInfo ? (
                <>
                  <p className="mt-2 text-slate-700">Последната обявена информация:</p>
                  <div className="mt-1 text-lg">
                    <Prose html={renderMarkdown(dutyInfo)} />
                  </div>
                </>
              ) : (
                <p className="mt-2 text-slate-700">
                  Вижте телефоните на аптеките по-долу и се обадете предварително.
                </p>
              )}
            </div>
          )}

          <p className="mt-4 text-sm text-slate-600">
            Съвет: при спешен здравословен проблем се обадете на{" "}
            <TelLink phone="112" className="font-semibold text-crimson-700 hover:underline">
              112
            </TelLink>
            .
          </p>
          <ShareButton
            className="mt-4"
            title="Дежурна аптека — За Бобов дол"
            text={shareText}
            path="/dezhurna-apteka"
          />
        </section>

        {/* Следващите дни от графика */}
        {duty.upcoming.length > 0 && (
          <section aria-labelledby="duty-next-title">
            <h2 id="duty-next-title" className="section-title mb-5">
              Дежурни аптеки в следващите дни
            </h2>
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {duty.upcoming.map((day) => (
                <li key={day.key} className="p-4">
                  <div className="text-base font-bold text-slate-900">
                    {dutyDayLabel(day.date, duty.day)}
                  </div>
                  {day.entries.map((e) => (
                    <div
                      key={e.id}
                      className="mt-1 flex flex-wrap items-center gap-x-2 text-base text-slate-700"
                    >
                      <span className="font-semibold text-slate-800">{e.pharmacy}</span>
                      {e.hours && <span>· {e.hours}</span>}
                      {e.address && <span>· {e.address}</span>}
                      {e.phone && (
                        <TelLink
                          phone={e.phone}
                          className="a11y-btn inline-flex items-center gap-1.5 font-semibold text-brand-700 underline underline-offset-2"
                        >
                          <Phone className="h-4 w-4 shrink-0" aria-hidden /> {e.phone}
                        </TelLink>
                      )}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Аптеки */}
        <section>
          <h2 className="section-title mb-5">Аптеки</h2>
          {allPharmacies === 0 ? (
            <EmptyState
              title="Още не са добавени аптеки."
              hint="Скоро тук ще видите аптеките с телефони и работно време."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {pharmacies.map(card)}
              {businessPharmacies.map(businessCard)}
            </div>
          )}
        </section>

        {/* Лекари и здравни услуги */}
        {others.length > 0 && (
          <section>
            <h2 className="section-title mb-5 flex items-center gap-2">
              <Stethoscope className="h-6 w-6 text-brand-700" aria-hidden />
              Лекари и здравни услуги
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">{others.map(card)}</div>
          </section>
        )}

        <div className="no-print">
          <PrintButton variant="secondary" label="Принтирай тази страница" />
        </div>

        <p className="text-sm text-slate-600">
          Виж и всички{" "}
          <Link href="/uslugi?cat=HEALTH" className="font-medium text-brand-700 hover:underline">
            здравни услуги и телефони →
          </Link>
        </p>
      </div>
    </>
  );
}
