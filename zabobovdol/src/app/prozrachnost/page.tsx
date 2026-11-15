import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, FileText, CalendarRange, ExternalLink, Info } from "@/components/icons";
import { PageHero, EmptyState, SectionHeader } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { TelLink } from "@/components/TelLink";
import { buildMetadata, webPageLd, canonical } from "@/lib/seo";
import { PrintButton } from "@/components/PrintButton";
import { formatMonthYear } from "@/lib/format-date";
import { SITE } from "@/lib/site";
import { SECTION } from "@/lib/section-names";
import { amountText, bgQuotes, shareNumber } from "@/lib/transparency-format";
import { getTransparency, SIGMA_AUTHORITY_URL } from "@/lib/transparency";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Прозрачност — обществените поръчки на община Бобов дол",
  description:
    "Къде отиват парите на община Бобов дол: обобщени данни за обществените поръчки — обща стойност, брой договори, най-големи изпълнители и категории. Официален източник: платформата СИГМА (МИДТ).",
  path: "/prozrachnost",
  keywords: [
    "обществени поръчки Бобов дол",
    "прозрачност община Бобов дол",
    "къде отиват парите на общината",
    "изпълнители на поръчки Бобов дол",
    "СИГМА обществени поръчки",
    "Carbon Stealth",
  ],
});

// Делът като тънка лента (само за окото; числото е до нея).
function ShareBar({ share }: { share?: string | null }) {
  const n = shareNumber(share);
  if (n === null) return null;
  return (
    <span aria-hidden="true" className="mt-1.5 block h-1.5 w-full min-w-16 rounded-full bg-brand-100">
      <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.max(n, 2)}%` }} />
    </span>
  );
}

function ShareCell({ share }: { share?: string | null }) {
  return (
    <>
      <span className="tabular-nums">{share ?? "—"}</span>
      <ShareBar share={share} />
    </>
  );
}

/** „1 договор“ / „8 договора“. */
function contractsText(raw: string): string {
  return raw.trim() === "1" ? "1 договор" : `${raw} договора`;
}

// Моментът на снимката → месец по софийско време („октомври 2026 г.“).
function monthYear(iso: string): string {
  return formatMonthYear(iso);
}

export default async function TransparencyPage() {
  const t = await getTransparency();

  const datasetLd = t
    ? {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "Обществени поръчки на община Бобов дол",
        description:
          "Обобщени данни за обществените поръчки на община Бобов дол: обща стойност, брой договори, изпълнители и категории.",
        url: canonical("/prozrachnost"),
        inLanguage: "bg",
        isAccessibleForFree: true,
        creator: { "@type": "GovernmentOrganization", name: "Министерство на иновациите и растежа (СИГМА)" },
        spatialCoverage: { "@type": "Place", name: "Община Бобов дол" },
        ...(t.period ? { temporalCoverage: t.period } : {}),
        sameAs: t.sourceUrl,
      }
    : null;

  return (
    <>
      {/* BreadcrumbList идва от PageHero (crumbs) — тук не се повтаря (B28). */}
      <JsonLd
        data={[
          webPageLd({
            name: "Прозрачност — обществените поръчки на община Бобов дол",
            description:
              "Къде отиват парите на община Бобов дол: обобщени данни за обществените поръчки.",
            path: "/prozrachnost",
            type: "CollectionPage",
          }),
          ...(datasetLd ? [datasetLd] : []),
        ]}
      />

      <PageHero
        eyebrow={SECTION.signals}
        title="Прозрачност на община Бобов дол"
        intro="Колко и за какво харчи общината по обществени поръчки и кои фирми печелят договорите. Данните са от официалната държавна платформа за прозрачност СИГМА."
        crumbs={[{ name: "Прозрачност", path: "/prozrachnost" }]}
      />

      <div className="container-content space-y-12 py-10">
        {!t ? (
          <EmptyState
            icon={Banknote}
            title="Данните се подготвят"
            hint="Скоро тук ще видите обобщените обществени поръчки на общината. Междувременно вижте официалната платформа СИГМА."
            action={
              <a href={SIGMA_AUTHORITY_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                <ExternalLink className="h-5 w-5 shrink-0" aria-hidden />
                Към СИГМА
                <span className="sr-only"> (отваря се в нов прозорец)</span>
              </a>
            }
          />
        ) : (
          <>
            {/* Ключови показатели */}
            <section aria-label="Накратко">
              <dl className="grid gap-4 sm:grid-cols-3">
                <div className="panel">
                  <dt className="flex items-center gap-2 text-base text-slate-600">
                    <Banknote className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                    Обща стойност на договорите
                  </dt>
                  <dd className="mt-2 font-display text-3xl font-bold tabular-nums text-slate-900">
                    {amountText(t.totalValue)}
                  </dd>
                </div>
                <div className="panel">
                  <dt className="flex items-center gap-2 text-base text-slate-600">
                    <FileText className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                    Брой договори
                  </dt>
                  <dd className="mt-2 font-display text-3xl font-bold tabular-nums text-slate-900">
                    {new Intl.NumberFormat("bg-BG").format(t.contractsCount)}
                  </dd>
                </div>
                <div className="panel">
                  <dt className="flex items-center gap-2 text-base text-slate-600">
                    <CalendarRange className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                    Период на данните
                  </dt>
                  <dd className="mt-2 text-lg font-bold text-slate-900">{t.period}</dd>
                </div>
              </dl>
            </section>

            {/* Най-големи изпълнители — на телефон кратък номериран списък
                („1. ИМЕ — 4,1 млн. € · 8 договора · 16,2%“), от sm — таблица. */}
            {t.topSuppliers.length > 0 && (
              <section aria-labelledby="firmi-zaglavie">
                <SectionHeader id="firmi-zaglavie" title="Кои фирми печелят най-много" />
                <ol role="list" className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white sm:hidden">
                  {t.topSuppliers.map((s) => (
                    <li key={s.rank} className="flex gap-3 p-4">
                      <span className="w-6 shrink-0 text-base font-semibold tabular-nums text-slate-600">
                        {s.rank}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-slate-900">{bgQuotes(s.name)}</p>
                        <p className="mt-0.5 text-base tabular-nums text-slate-700">
                          <strong className="text-slate-900">{amountText(s.amount)}</strong>
                          {s.contracts && <> · {contractsText(s.contracts)}</>}
                          {s.share && <> · {s.share}</>}
                        </p>
                        <ShareBar share={s.share} />
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white sm:block">
                  <table className="w-full text-left text-base">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          №
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Изпълнител
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">
                          Спечелено
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">
                          Договори
                        </th>
                        <th scope="col" className="w-36 px-4 py-3 text-right font-semibold">
                          Дял
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {t.topSuppliers.map((s) => (
                        <tr key={s.rank}>
                          <td className="px-4 py-3 tabular-nums text-slate-600">
                            {s.rank}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {bgQuotes(s.name)}
                          </td>
                          <td
                           
                            className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900"
                          >
                            {amountText(s.amount)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {s.contracts ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            <ShareCell share={s.share} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* По категории */}
            {t.categories.length > 0 && (
              <section aria-labelledby="kategorii-zaglavie">
                <SectionHeader id="kategorii-zaglavie" title="За какво се харчи" />
                <ul role="list" className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white sm:hidden">
                  {t.categories.map((c, i) => (
                    <li key={i} className="p-4">
                      <p className="text-base font-semibold text-slate-900">{c.name}</p>
                      <p className="mt-0.5 text-base tabular-nums text-slate-700">
                        <strong className="text-slate-900">{amountText(c.amount)}</strong>
                        {c.share && <> · {c.share}</>}
                      </p>
                      <ShareBar share={c.share} />
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white sm:block">
                  <table className="w-full text-left text-base">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Категория
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">
                          Стойност
                        </th>
                        <th scope="col" className="w-36 px-4 py-3 text-right font-semibold">
                          Дял
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {t.categories.map((c, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3 text-slate-900">
                            {c.name}
                          </td>
                          <td
                           
                            className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900"
                          >
                            {amountText(c.amount)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            <ShareCell share={c.share} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Източник и връзка към живите данни */}
            <section aria-labelledby="iztochnik-zaglavie" className="callout-info">
              <h2 id="iztochnik-zaglavie" className="h-card flex items-center gap-2">
                <Info className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                Източник на данните
              </h2>
              <p className="mt-2 text-base text-slate-700">
                Данните са обобщени от <strong>СИГМА</strong> — официалната платформа за
                прозрачност на обществените поръчки на Министерството на иновациите и растежа
                (отворени данни).
                {t.updatedAt && (
                  <>
                    {" "}
                    Снимка към <strong>{monthYear(t.updatedAt)}</strong>
                  </>
                )}{" "}
                За най-актуалните и подробни данни (всеки договор поотделно) вижте страницата на
                общината в СИГМА.
              </p>
              <a
                href={t.sourceUrl || SIGMA_AUTHORITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="no-print btn-primary mt-4 w-full sm:w-auto"
              >
                <ExternalLink className="h-5 w-5 shrink-0" aria-hidden />
                Вижте пълните данни в СИГМА
                <span className="sr-only"> (отваря се в нов прозорец)</span>
              </a>
            </section>

            <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <PrintButton variant="secondary" label="Отпечатайте" />
              <p className="text-base text-slate-600">
                Забелязали сте нещо нередно в харченето на общински средства? Подайте{" "}
                <Link href="/signali" className="link">
                  сигнал
                </Link>{" "}
                или ни се обадете на{" "}
                <TelLink phone={SITE.contact.phone} className="link whitespace-nowrap" />.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
