import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section, StatCard } from "@/components/ui";
import { RegionsMap } from "@/components/RegionsMap";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { Building, Info, Layers } from "@/components/icons";
import { enterprisesByOblast } from "@/data/geo";

export const metadata: Metadata = buildMetadata({
  title: "Държавните предприятия по области",
  description:
    "Карта на България по 28-те области, оцветена по броя държавни предприятия със седалище там. Виж кои предприятия са регистрирани във всяка област и къде се концентрира държавната собственост.",
  path: "/regioni",
});

export default function RegioniPage() {
  const { ranked, national } = enterprisesByOblast();
  const counts = new Map(ranked.map((o) => [o.name, o.count]));
  const withAny = ranked.filter((o) => o.count > 0);
  const top = withAny[0];
  const mapped = withAny.reduce((s, o) => s + o.count, 0);

  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "По области", path: "/regioni" },
        ])}
      />
      <PageHero
        eyebrow="Географско разпределение"
        title="Държавните предприятия по области"
        intro="Къде са регистрирани държавните предприятия? Картата оцветява 28-те области по броя предприятия със седалище в тях. Кликни върху област, за да видиш кои са те."
        crumbs={[{ name: "По области", path: "/regioni" }]}
      />

      <div className="container-content space-y-14 py-10">
        <Section>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              value={withAny.length}
              label="области с поне едно държавно предприятие (от 28)"
              icon={<Layers className="h-7 w-7" aria-hidden />}
            />
            <StatCard
              value={top ? `${Math.round((top.count / mapped) * 100)}%` : "—"}
              label={top ? `от предприятията са със седалище в „${top.name}“` : ""}
              icon={<Building className="h-7 w-7" aria-hidden />}
            />
            <StatCard
              value={national.length}
              label="предприятия с национален обхват (без една конкретна област)"
              icon={<Info className="h-7 w-7" aria-hidden />}
            />
          </div>
        </Section>

        <Section>
          <RegionsMap counts={counts} />
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p>
              <strong>Важно:</strong> картата показва къде е <em>регистрирано седалището</em>, а не
              къде оперира предприятието. Много холдинги със седалище в София (енергетика, транспорт,
              отбрана) работят в цялата страна. Затова София доминира — там са централите, не
              непременно дейността.
            </p>
          </div>
        </Section>

        <Section title="По области" icon={<Building className="h-6 w-6 text-brand-700" aria-hidden />}>
          <div className="space-y-6">
            {withAny.map((o) => (
              <div
                key={o.code}
                id={`obl-${o.code}`}
                className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-bold text-slate-900">{o.name}</h3>
                  <span className="text-sm font-semibold text-brand-700">
                    {o.count} {o.count === 1 ? "предприятие" : "предприятия"}
                  </span>
                </div>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {o.enterprises.map((e) => (
                    <li key={e.slug}>
                      <Link
                        href={`/predpriyatiya/${e.slug}`}
                        className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700 hover:border-brand-300 hover:text-brand-700"
                      >
                        {e.shortName ?? e.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {national.length > 0 && (
          <Section title="Национален обхват" icon={<Info className="h-6 w-6 text-brand-700" aria-hidden />}>
            <p className="mb-3 text-sm text-slate-600">
              Тези предприятия нямат една конкретна област — дейността им покрива цялата страна
              (мрежи от клонове или центрове).
            </p>
            <ul className="flex flex-wrap gap-2">
              {national.map((e) => (
                <li key={e.slug}>
                  <Link
                    href={`/predpriyatiya/${e.slug}`}
                    className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700 hover:border-brand-300 hover:text-brand-700"
                  >
                    {e.shortName ?? e.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <p className="text-sm text-slate-500">
          Виж целия каталог в{" "}
          <Link href="/predpriyatiya" className="font-medium text-brand-700 hover:underline">
            Предприятия
          </Link>
          , обобщените числа в{" "}
          <Link href="/kartina" className="font-medium text-brand-700 hover:underline">
            Картината на сектора
          </Link>
          , или кой печели обществените поръчки в{" "}
          <Link href="/koncentraciya" className="font-medium text-brand-700 hover:underline">
            Концентрацията
          </Link>
          .
        </p>
      </div>
    </>
  );
}
