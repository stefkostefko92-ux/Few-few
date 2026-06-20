import Link from "next/link";
import type { Metadata } from "next";
import { Cross, Phone, MapPin, Clock, Stethoscope } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, Prose } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, itemListLd } from "@/lib/seo";
import { renderMarkdown } from "@/lib/markdown";
import { getDutyInfo } from "@/lib/settings";
import { PrintButton } from "@/components/PrintButton";
import { OpenNowBadge } from "@/components/OpenNowBadge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Дежурна аптека и лекар в Бобов дол",
  description:
    "Коя аптека е дежурна в момента и кои са телефоните на аптеките и лекарите в Бобов дол — работно време и адреси на едно място.",
  path: "/dezhurna-apteka",
});

export default async function DutyPharmacyPage() {
  const [dutyInfo, health] = await Promise.all([
    getDutyInfo(),
    prisma.service.findMany({
      where: { published: true, category: "HEALTH" },
      orderBy: { order: "asc" },
    }),
  ]);

  const pharmacies = health.filter((s) => /аптек/i.test(s.name));
  const others = health.filter((s) => !/аптек/i.test(s.name));

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
            <a href={`tel:${s.phone}`} className="font-semibold text-brand-700 hover:underline">
              {s.phone}
            </a>
            {s.phone2 && (
              <a href={`tel:${s.phone2}`} className="text-brand-700 hover:underline">
                · {s.phone2}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );

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
      <PageHero
        eyebrow="Здраве"
        title="Дежурна аптека и лекар"
        intro="Коя аптека работи в момента и важните телефони на аптеките и лекарите в Бобов дол."
        crumbs={[{ name: "Дежурна аптека", path: "/dezhurna-apteka" }]}
      />

      <div className="container-content space-y-10 py-10">
        {/* Текущо дежурство (редактира се от админ панела) */}
        <section className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-6">
          <div className="flex items-center gap-2">
            <Cross className="h-6 w-6 text-crimson-600" aria-hidden />
            <h2 className="text-2xl font-bold text-slate-900">Дежурно в момента</h2>
          </div>
          {dutyInfo ? (
            <div className="mt-3 text-lg">
              <Prose html={renderMarkdown(dutyInfo)} />
            </div>
          ) : (
            <p className="mt-3 text-slate-700">
              В момента няма обявена информация за дежурство. Вижте телефоните на
              аптеките по-долу или се обадете предварително.
            </p>
          )}
          <p className="mt-4 text-sm text-slate-500">
            Съвет: при спешен здравословен проблем се обадете на{" "}
            <a href="tel:112" className="font-semibold text-crimson-700 hover:underline">
              112
            </a>
            .
          </p>
        </section>

        {/* Аптеки */}
        <section>
          <h2 className="section-title mb-5">Аптеки</h2>
          {pharmacies.length === 0 ? (
            <EmptyState
              title="Още не са добавени аптеки."
              hint="Скоро тук ще видите аптеките с телефони и работно време."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">{pharmacies.map(card)}</div>
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

        <p className="text-sm text-slate-500">
          Виж и всички{" "}
          <Link href="/uslugi?cat=HEALTH" className="font-medium text-brand-700 hover:underline">
            здравни услуги и телефони →
          </Link>
        </p>
      </div>
    </>
  );
}
