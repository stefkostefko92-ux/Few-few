import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { Callout } from "@/components/content";
import {
  NAME_DAYS,
  keyFor,
  formatKey,
  sortedNameDays,
} from "@/data/namedays";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Именни дни",
  description:
    "Кой празнува днес и календар на по-известните български именни дни с фиксирана дата.",
  path: "/imen-den",
});

export default function ImenDenPage() {
  const today = new Date();
  const todayKey = keyFor(today);
  const todayNames = NAME_DAYS[todayKey] ?? [];
  const all = sortedNameDays();

  return (
    <>
      <JsonLd data={webPageLd({ name: "Именни дни", path: "/imen-den" })} />
      <PageHero
        eyebrow="Календар"
        title="Именни дни"
        intro="Кой празнува днес и кога са по-известните именни дни."
        crumbs={[{ name: "Именни дни", path: "/imen-den" }]}
      />
      <div className="container-content py-10">
        <div className="rounded-2xl border border-gold-300 bg-gold-50 p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-gold-700">
            Днес ({formatKey(todayKey)})
          </p>
          {todayNames.length > 0 ? (
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-900">
              Празнуват: {todayNames.join(", ")}. Честит имен ден!
            </p>
          ) : (
            <p className="mt-1 text-lg text-slate-700">
              Днес няма отбелязан именен ден от нашия списък.
            </p>
          )}
        </div>

        <h2 className="section-title mb-5 mt-10">Календар на именните дни</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {all.map(({ key, names }) => (
            <li
              key={key}
              className={
                "rounded-lg border p-3 " +
                (key === todayKey
                  ? "border-gold-400 bg-gold-50"
                  : "border-slate-200 bg-white")
              }
            >
              <span className="font-semibold text-brand-700">{formatKey(key)}</span>
              <span className="text-slate-700"> — {names.join(", ")}</span>
            </li>
          ))}
        </ul>

        <Callout tone="info">
          Списъкът включва по-известните имени дни с постоянна дата. Подвижните
          празници (свързани с Великден) не са включени тук.
        </Callout>
      </div>
    </>
  );
}
