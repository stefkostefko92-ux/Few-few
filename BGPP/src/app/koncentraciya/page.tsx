import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { Building, External, Info } from "@/components/icons";
import { BIG_CONTRACTORS, PROCUREMENT_SOURCES, SIGMA_BASE } from "@/data/procurement";

export const metadata: Metadata = buildMetadata({
  title: "Концентрация на поръчките",
  description:
    "Кои частни фирми и групи печелят най-много от държавните предприятия в България. Публични данни от СИГМА и Търговския регистър — картина на концентрацията, не обвинение.",
  path: "/koncentraciya",
});

export default function ConcentrationPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "Концентрация на поръчките", path: "/koncentraciya" },
        ])}
      />
      <PageHero
        eyebrow="Къде отиват парите"
        title="Концентрация на поръчките"
        intro="Проследихме кои частни фирми печелят най-много от държавните предприятия. Оказва се, че шепа групи взимат кръстосано големите поръчки. Това е публичен факт от СИГМА и Търговския регистър — картина на концентрация, не обвинение."
        crumbs={[{ name: "Концентрация на поръчките", path: "/koncentraciya" }]}
      />

      <div className="container-content space-y-10 py-10">
        <Section>
          <div className="rounded-xl border-l-4 border-brand-400 bg-brand-50 p-4 text-sm text-slate-700">
            Сумите са сборни от СИГМА (обществени поръчки, ~2020–2026), ориентировъчни и
            закръглени; подредбата е по общ държавен „отпечатък“. Посочените{" "}
            <strong>собственици са вписаните в Търговския регистър/ЗМИП</strong> — публичен
            факт, а не обвинение. Наличието на фирма тук <strong>не означава нарушение</strong>
            {" "}— показва мащаба на държавния ѝ бизнес и кой стои зад него.
          </div>
        </Section>

        <Section>
          {(() => {
            const sorted = [...BIG_CONTRACTORS].sort((a, b) => b.totalMln - a.totalMln);
            const total = sorted.reduce((s, c) => s + c.totalMln, 0);
            const top5 = sorted.slice(0, 5).reduce((s, c) => s + c.totalMln, 0);
            const share = Math.round((top5 / total) * 100);
            return (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="text-3xl font-extrabold text-slate-900">{sorted.length}</div>
                  <div className="text-sm text-slate-600">проследени едри изпълнителя</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="text-3xl font-extrabold text-slate-900">≈{total.toLocaleString("bg-BG")} млн. €</div>
                  <div className="text-sm text-slate-600">общ проследен обем поръчки</div>
                </div>
                <div className="rounded-xl border border-outflow-200 bg-outflow-50 p-5">
                  <div className="text-3xl font-extrabold text-outflow-700">{share}%</div>
                  <div className="text-sm text-slate-600">взети от само топ-5 групи</div>
                </div>
              </div>
            );
          })()}
        </Section>

        <Section
          title="Най-големите изпълнители на държавни поръчки"
          icon={<Building className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <div className="space-y-4">
            {[...BIG_CONTRACTORS]
              .sort((a, b) => b.totalMln - a.totalMln)
              .map((c, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-bold text-slate-900">
                    <span className="mr-2 text-slate-400">{i + 1}.</span>
                    {c.name}
                  </h3>
                  <span className="text-sm text-slate-500">{c.field}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="font-semibold text-brand-700">
                    ≈ {c.totalMln} млн. € държавни поръчки
                  </span>
                  {c.group && <span>Група: {c.group}</span>}
                </div>
                {c.owner && (
                  <p className="mt-2 text-sm text-slate-700">
                    <span className="font-semibold">Собственик: </span>
                    {c.owner}
                  </p>
                )}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="pb-1 pr-4 font-medium">Държавен възложител</th>
                        <th className="pb-1 pr-4 text-right font-medium">Спечелено</th>
                        <th className="pb-1 font-medium">СИГМА</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {c.wins.map((w, j) => (
                        <tr key={j}>
                          <td className="py-2 pr-4 font-medium text-slate-800">{w.client}</td>
                          <td className="py-2 pr-4 text-right text-slate-700">{w.amount}</td>
                          <td className="py-2">
                            <a
                              href={`${SIGMA_BASE}/${w.clientEik}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                            >
                              данни
                              <External className="h-3.5 w-3.5" aria-hidden />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {c.note && <p className="mt-3 text-sm text-slate-600">{c.note}</p>}
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Защо концентрацията е тема за прозрачност"
          icon={<Info className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <ul className="list-disc space-y-2 pl-6 text-slate-600">
            <li>
              Когато малко фирми печелят повечето големи поръчки (често през{" "}
              <strong>обединения/ДЗЗД</strong>), реалната конкуренция намалява, а цените
              трудно се проверяват.
            </li>
            <li>
              Част от поръчките се възлагат <strong>вътрешно (in-house)</strong> на държавни
              дружества, които после наемат същите частни групи като подизпълнители — виж{" "}
              <Link href="/konflikti" className="font-medium text-brand-700 hover:underline">
                конфликт на интереси
              </Link>
              .
            </li>
            <li>
              <strong>Отбранителните</strong> поръчки (ВМЗ, Кинтекс) изобщо не се публикуват —
              там концентрацията не може да се провери.
            </li>
            <li>
              За вече документирани нередности около тези възложители виж{" "}
              <Link href="/sluchai" className="font-medium text-brand-700 hover:underline">
                известните случаи
              </Link>{" "}
              (разследване не е присъда).
            </li>
          </ul>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {PROCUREMENT_SOURCES.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-4 text-sm hover:border-brand-300"
                >
                  <span className="font-medium text-slate-800">{s.label}</span>
                  <External className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
