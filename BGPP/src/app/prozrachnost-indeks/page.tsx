import type { Metadata } from "next";
import Link from "next/link";
import { ENTERPRISES } from "@/data/enterprises";
import { sector as getSector } from "@/data/sectors";
import { transparency } from "@/lib/aggregate";
import { PageHero, Section, Badge } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { Eye, Info } from "@/components/icons";

export const metadata: Metadata = buildMetadata({
  title: "Индекс на прозрачност — класация",
  description:
    "Кои държавни предприятия са най-прозрачни и кои най-непрозрачни — класация по публична проследимост (сайт, ЕИК, публикувани финанси, публични поръчки, източници).",
  path: "/prozrachnost-indeks",
});

export default function TransparencyRankingPage() {
  const ranked = ENTERPRISES.map((e) => ({ e, t: transparency(e) })).sort(
    (a, b) => b.t.score - a.t.score || a.e.name.localeCompare(b.e.name, "bg"),
  );
  const dist = [0, 1, 2, 3, 4, 5].map(
    (s) => ranked.filter((r) => r.t.score === s).length,
  );

  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "Индекс на прозрачност", path: "/prozrachnost-indeks" },
        ])}
      />
      <PageHero
        eyebrow="Класация"
        title="Индекс на прозрачност"
        intro="Кои държавни предприятия са най-лесни за проследяване и кои — най-трудни. Индексът измерва публична проследимост по пет проверими критерия, не качество на управлението."
        crumbs={[{ name: "Индекс на прозрачност", path: "/prozrachnost-indeks" }]}
      />

      <div className="container-content space-y-10 py-10">
        <Section>
          <div className="grid gap-3 sm:grid-cols-6">
            {dist.map((count, s) => (
              <div
                key={s}
                className="rounded-xl border border-slate-200 bg-white p-4 text-center"
              >
                <div className="text-2xl font-extrabold text-slate-900">{count}</div>
                <div className="text-xs text-slate-500">{s}/5 точки</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Критерии: официален сайт · ЕИК в регистъра · публикувани финансови данни ·
            публични обществени поръчки · няколко независими източника.
          </p>
        </Section>

        <Section title="Класация" icon={<Eye className="h-6 w-6 text-brand-700" aria-hidden />}>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Предприятие</th>
                  <th className="px-4 py-3">Сектор</th>
                  <th className="px-4 py-3 w-40">Индекс</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ranked.map(({ e, t }, i) => (
                  <tr key={e.slug}>
                    <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/predpriyatiya/${e.slug}`}
                        className="font-medium text-slate-900 hover:text-brand-700"
                      >
                        {e.shortName ?? e.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="brand">{getSector(e.sector).short}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                          <span
                            className={`block h-full rounded-full ${
                              t.score >= 4
                                ? "bg-inflow-500"
                                : t.score >= 2
                                  ? "bg-brand-400"
                                  : "bg-outflow-500"
                            }`}
                            style={{ width: `${(t.score / t.max) * 100}%` }}
                          />
                        </span>
                        <span className="text-xs font-semibold text-slate-600">
                          {t.score}/{t.max}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section icon={<Info className="h-6 w-6 text-brand-700" aria-hidden />}>
          <div className="rounded-xl border-l-4 border-brand-400 bg-brand-50 p-4 text-sm text-slate-700">
            Ниският резултат често не е вина на самото дружество, а на модела: напр.{" "}
            <strong>отбранителните</strong> дружества по закон не публикуват поръчки, затова
            губят точка. Индексът показва <em>проследимост</em>, не добросъвестност.
          </div>
        </Section>
      </div>
    </>
  );
}
