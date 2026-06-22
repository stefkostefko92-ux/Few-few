import type { Metadata } from "next";
import { buildMetadata, webPageLd, localBusinessLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { Pill, Globe, Info, AlertTriangle } from "@/components/icons";
import { PHARMACIES_24H, PHARMACY_DIRECTORY } from "@/data/pharmacies";

export const metadata: Metadata = buildMetadata({
  title: "Дежурна аптека в Дупница",
  description:
    "Коя аптека работи денонощно в Дупница и къде да намерите пълния списък на аптеките. Честна информация — официален дежурен график за Дупница не се публикува онлайн.",
  path: "/dezhurna-apteka",
});

export default function DezhurnaAptekaPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageLd({
            name: "Дежурна аптека в Дупница",
            path: "/dezhurna-apteka",
          }),
          ...PHARMACIES_24H.map((p) =>
            localBusinessLd({
              name: p.name,
              description: p.note,
              address: p.address,
              phone: p.phone?.replace(/\s+/g, ""),
              hours: p.is24h ? "Mo-Su 00:00-23:59" : undefined,
              schemaType: "Pharmacy",
            }),
          ),
        ]}
      />
      <PageHero
        eyebrow="Здраве"
        title="Дежурна аптека"
        intro="Коя аптека работи денонощно в Дупница. Тук показваме само проверена информация."
        crumbs={[{ name: "Дежурна аптека", path: "/dezhurna-apteka" }]}
      />

      <div className="container-content py-10">
        {/* Честно обяснение на ограничението — намерено при проучването. */}
        <div className="mb-8 flex items-start gap-3 rounded-xl border border-gold-300 bg-gold-50 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" aria-hidden />
          <p className="text-base text-slate-700">
            За Дупница не се публикува официален ротационен график на „дежурни“
            аптеки по дни. Затова тук посочваме потвърдената{" "}
            <strong>денонощна</strong> аптека и насочваме към пълния списък,
            вместо да гадаем кой дежури. Препоръчваме да се обадите предварително
            и да потвърдите работното време.
          </p>
        </div>

        <h2 className="section-title mb-6">Денонощна аптека</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {PHARMACIES_24H.map((p) => (
            <article key={p.name} className="card">
              <div className="mb-2 flex items-center gap-2">
                <Pill className="h-6 w-6 text-brand-700" aria-hidden />
                <span className="badge bg-brand-100">Денонощно</span>
              </div>
              <h3 className="font-display text-xl font-bold text-slate-900">
                {p.name}
              </h3>
              {p.note && (
                <p className="mt-2 text-base text-slate-600">{p.note}</p>
              )}
              {p.address && (
                <p className="mt-2 text-base text-slate-700">{p.address}</p>
              )}
              {p.phone && (
                <a
                  href={"tel:" + p.phone.replace(/\s+/g, "")}
                  className="mt-2 inline-block text-lg font-semibold text-brand-700 hover:underline"
                >
                  {p.phone}
                </a>
              )}
            </article>
          ))}
        </div>

        <h2 className="section-title mb-4 mt-12">Всички аптеки в Дупница</h2>
        <p className="max-w-3xl text-base text-slate-700">
          {PHARMACY_DIRECTORY.note}
        </p>
        <a
          href={PHARMACY_DIRECTORY.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-base font-medium text-brand-700 hover:underline"
        >
          <Globe className="h-5 w-5" aria-hidden />
          {PHARMACY_DIRECTORY.label}
        </a>

        <div className="mt-10 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden />
          <p className="text-base text-slate-700">
            При спешен здравен проблем се обадете на{" "}
            <a href="tel:112" className="font-bold text-red-800 underline">
              112
            </a>
            . Тази страница е само за информация и не замества лекар.
          </p>
        </div>
      </div>
    </>
  );
}
