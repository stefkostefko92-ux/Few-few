import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PrintButton } from "@/components/PrintButton";
import { SERVICES, CATEGORY_LABELS, CATEGORY_ORDER } from "@/data/services";

export const metadata: Metadata = buildMetadata({
  title: "Телефони за печат",
  description: "Списък с важните телефони за Дупница, готов за разпечатване и закачане у дома.",
  path: "/pechat",
});

export default function PechatPage() {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: SERVICES.filter((s) => s.category === cat && s.phones.length > 0),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <JsonLd data={webPageLd({ name: "Телефони за печат", path: "/pechat" })} />
      <div className="container-content py-10">
        <div className="no-print mb-6 flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-extrabold text-slate-900">
            Важни телефони — за печат
          </h1>
          <PrintButton label="Разпечатай" />
        </div>

        <div className="print-sheet rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-2xl font-extrabold text-slate-900">
            Важни телефони — Дупница
          </h2>
          <p className="mt-1 text-base text-slate-600">
            Спешен телефон: <strong>112</strong>
          </p>

          <div className="mt-5 space-y-5">
            {grouped.map(({ cat, items }) => (
              <div key={cat}>
                <h3 className="font-display text-lg font-bold text-brand-800">
                  {CATEGORY_LABELS[cat]}
                </h3>
                <ul className="mt-1">
                  {items.map((s) => (
                    <li key={s.slug} className="flex justify-between border-b border-slate-100 py-1">
                      <span className="text-slate-800">{s.name}</span>
                      <span className="font-semibold text-slate-900">
                        {s.phones.map((p) => p.number).join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm text-slate-500">
            zadupnitsa.eu — граждански портал за Дупница. Не е официалният сайт на общината.
          </p>
        </div>
      </div>
    </>
  );
}
