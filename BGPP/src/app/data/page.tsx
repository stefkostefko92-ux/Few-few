import type { Metadata } from "next";
import { PageHero, Section } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { Layers, External } from "@/components/icons";
import { totalEnterprises } from "@/lib/aggregate";

export const metadata: Metadata = buildMetadata({
  title: "Отворени данни",
  description:
    "Свалете целия набор данни за държавните предприятия в България като JSON или CSV — за журналисти, изследователи и разработчици.",
  path: "/data",
});

export default function DataPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "Отворени данни", path: "/data" },
        ])}
      />
      <PageHero
        eyebrow="За журналисти и разработчици"
        title="Отворени данни"
        intro="Целият набор е свободен за сваляне и повторно използване. Проверявайте в първичните регистри и посочвайте източника."
        crumbs={[{ name: "Отворени данни", path: "/data" }]}
      />
      <div className="container-content space-y-10 py-10">
        <Section title="Свали" icon={<Layers className="h-6 w-6 text-brand-700" aria-hidden />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <a
              href="/data.json"
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-300"
            >
              <span className="flex items-center justify-between">
                <span className="text-lg font-bold text-slate-900">JSON</span>
                <External className="h-4 w-4 text-brand-700" aria-hidden />
              </span>
              <span className="mt-1 text-sm text-slate-600">
                Пълният набор: {totalEnterprises()} предприятия, сектори, принципали,
                концентрация, случаи и национални агрегати.
              </span>
              <code className="mt-3 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">/data.json</code>
            </a>
            <a
              href="/data.csv"
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-300"
            >
              <span className="flex items-center justify-between">
                <span className="text-lg font-bold text-slate-900">CSV</span>
                <External className="h-4 w-4 text-brand-700" aria-hidden />
              </span>
              <span className="mt-1 text-sm text-slate-600">
                Предприятията в таблица (за Excel/Google Sheets) — с индекс на прозрачност и
                брой случаи.
              </span>
              <code className="mt-3 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">/data.csv</code>
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Машинночетимо описание за AI/агенти: <a href="/llms.txt" className="font-medium text-brand-700 hover:underline">/llms.txt</a>.
          </p>
        </Section>

        <Section title="Условия за ползване">
          <div className="rounded-xl border-l-4 border-brand-400 bg-brand-50 p-5 text-sm text-slate-700">
            <p>
              Данните са компилирани от публични официални източници (АППК, Търговски
              регистър, Министерство на финансите, СИГМА, Сметна палата, ЕППО/OLAF). Може да
              ги ползвате свободно с посочване на източника (CC BY 4.0). Проектът е
              образователен и не е официален; за правен ефект сверявайте с първичните
              регистри. „Известни случаи“ са с ясен правен статус — разследване не е присъда.
            </p>
          </div>
        </Section>
      </div>
    </>
  );
}
