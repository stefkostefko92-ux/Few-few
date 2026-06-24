import type { Metadata } from "next";
import {
  Banknote,
  FileText,
  CalendarRange,
  Building2,
  ExternalLink,
  Info,
  ListChecks,
} from "@/components/icons";
import { PageHero, EmptyState } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, webPageLd, breadcrumbLd, canonical } from "@/lib/seo";
import { PrintButton } from "@/components/PrintButton";
import { SITE } from "@/lib/site";
import { getTransparency, SIGMA_AUTHORITY_URL } from "@/lib/transparency";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Прозрачност — обществените поръчки на община Дупница",
  description:
    "Къде отиват парите на община Дупница: обобщени данни за обществените поръчки — обща стойност, брой договори, най-големи изпълнители и категории. Официален източник: платформата СИГМА (МИДТ).",
  path: "/prozrachnost",
});

function monthYear(iso: string): string {
  try {
    return new Intl.DateTimeFormat("bg-BG", { month: "long", year: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return "";
  }
}

export default async function TransparencyPage() {
  const t = await getTransparency();

  const datasetLd = t
    ? {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "Обществени поръчки на община Дупница",
        description:
          "Обобщени данни за обществените поръчки на община Дупница: обща стойност, брой договори, изпълнители и категории.",
        url: canonical("/prozrachnost"),
        inLanguage: "bg",
        isAccessibleForFree: true,
        creator: { "@type": "GovernmentOrganization", name: "Министерство на иновациите и растежа (СИГМА)" },
        spatialCoverage: { "@type": "Place", name: "Община Дупница" },
        ...(t.period ? { temporalCoverage: t.period } : {}),
        sameAs: t.sourceUrl,
      }
    : null;

  return (
    <>
      <JsonLd
        data={[
          webPageLd({
            name: "Прозрачност — обществените поръчки на община Дупница",
            description:
              "Къде отиват парите на община Дупница: обобщени данни за обществените поръчки.",
            path: "/prozrachnost",
            type: "CollectionPage",
          }),
          breadcrumbLd([
            { name: "Начало", path: "/" },
            { name: "Прозрачност", path: "/prozrachnost" },
          ]),
          ...(datasetLd ? [datasetLd] : []),
        ]}
      />

      <PageHero
        eyebrow="Къде отиват парите"
        title="Прозрачност на община Дупница"
        intro="Колко и за какво харчи общината по обществени поръчки, и кои фирми печелят договорите. Данните са от официалната държавна платформа за прозрачност СИГМА."
        crumbs={[{ name: "Прозрачност", path: "/prozrachnost" }]}
      />

      <div className="container-content space-y-10 py-10">
        {!t ? (
          <EmptyState
            title="Данните се подготвят"
            hint="Скоро тук ще видите обобщените обществени поръчки на общината. Междувременно вижте официалната платформа СИГМА."
          />
        ) : (
          <>
            {/* Ключови показатели */}
            <section>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <Banknote className="h-7 w-7 text-brand-700" aria-hidden />
                  <div className="mt-2 text-3xl font-extrabold text-slate-900">{t.totalValue}</div>
                  <div className="text-sm text-slate-600">Обща стойност на договорите</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <FileText className="h-7 w-7 text-brand-700" aria-hidden />
                  <div className="mt-2 text-3xl font-extrabold text-slate-900">{t.contractsCount}</div>
                  <div className="text-sm text-slate-600">Брой договори</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <CalendarRange className="h-7 w-7 text-brand-700" aria-hidden />
                  <div className="mt-2 text-lg font-bold text-slate-900">{t.period}</div>
                  <div className="text-sm text-slate-600">Период на данните</div>
                </div>
              </div>
            </section>

            {/* Най-големи изпълнители */}
            {t.topSuppliers.length > 0 && (
              <section>
                <h2 className="section-title mb-4 flex items-center gap-2">
                  <Building2 className="h-6 w-6 text-brand-700" aria-hidden />
                  Кои фирми печелят най-много
                </h2>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Изпълнител</th>
                        <th className="px-4 py-3 text-right">Спечелено</th>
                        <th className="px-4 py-3 text-right">Договори</th>
                        <th className="px-4 py-3 text-right">Дял</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {t.topSuppliers.map((s) => (
                        <tr key={s.rank}>
                          <td className="px-4 py-3 text-slate-500">{s.rank}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">{s.amount}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{s.contracts ?? "—"}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{s.share ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* По категории */}
            {t.categories.length > 0 && (
              <section>
                <h2 className="section-title mb-4 flex items-center gap-2">
                  <ListChecks className="h-6 w-6 text-brand-700" aria-hidden />
                  За какво се харчи
                </h2>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Категория</th>
                        <th className="px-4 py-3 text-right">Стойност</th>
                        <th className="px-4 py-3 text-right">Дял</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {t.categories.map((c, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3 text-slate-900">{c.name}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">{c.amount}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{c.share ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Източник и връзка към живите данни */}
            <section className="rounded-2xl border border-brand-200 bg-brand-50 p-6">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-brand-700" aria-hidden />
                <h2 className="text-lg font-bold text-slate-900">Източник на данните</h2>
              </div>
              <p className="mt-2 text-slate-700">
                Данните са обобщени от <strong>СИГМА</strong> — официалната платформа за
                прозрачност на обществените поръчки на Министерството на иновациите и
                растежа (отворени данни).
                {t.updatedAt && (
                  <> Снимка към <strong>{monthYear(t.updatedAt)}</strong>.</>
                )}{" "}
                За най-актуалните и подробни данни (всеки договор поотделно) вижте
                страницата на общината в СИГМА.
              </p>
              <a
                href={t.sourceUrl || SIGMA_AUTHORITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-4 inline-flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Виж пълните данни в СИГМА
              </a>
            </section>

            <div className="no-print">
              <PrintButton variant="secondary" label="Принтирай" />
            </div>

            <p className="text-sm text-slate-500">
              Забелязали сте нещо нередно в харченето на общински средства? Може да
              подадете{" "}
              <a href="/signali" className="font-medium text-brand-700 hover:underline">
                сигнал
              </a>{" "}
              или да ни пишете на{" "}
              <a href={`tel:${SITE.contact.phone}`} className="font-medium text-brand-700 hover:underline">
                {SITE.contact.phone}
              </a>
              .
            </p>
          </>
        )}
      </div>
    </>
  );
}
