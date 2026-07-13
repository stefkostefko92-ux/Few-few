import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { ArrowInflow, ArrowOutflow, Building, Banknote } from "@/components/icons";
import { HIGHLIGHTS, NATIONAL } from "@/data/national";

export const metadata: Metadata = buildMetadata({
  title: "Класации",
  description:
    "Кой носи най-много на държавата и кой източва най-много: най-големи дивиденти, загуби, субсидии и работодатели сред държавните предприятия.",
  path: "/klasacii",
});

function Board({
  title,
  icon,
  items,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: readonly { name: string; value: string }[];
  tone: "inflow" | "outflow" | "brand";
}) {
  const border =
    tone === "inflow" ? "border-inflow-200" : tone === "outflow" ? "border-outflow-200" : "border-brand-200";
  return (
    <div className={`rounded-xl border ${border} bg-white p-5 shadow-sm`}>
      <h3 className="flex items-center gap-2 font-bold text-slate-900">{icon}{title}</h3>
      <ol className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li key={it.name} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-slate-700">
              <span className="mr-1 text-slate-400">{i + 1}.</span>
              {it.name}
            </span>
            <span className="shrink-0 font-semibold text-slate-900">{it.value}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function RankingsPage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Начало", path: "/" }, { name: "Класации", path: "/klasacii" }])} />
      <PageHero
        eyebrow={`Данни ${NATIONAL.year}`}
        title="Класации"
        intro="Кой носи най-много на държавата и кой източва най-много от бюджета. Данни от Годишния обобщен доклад на АППК."
        crumbs={[{ name: "Класации", path: "/klasacii" }]}
      />
      <div className="container-content space-y-10 py-10">
        <Section>
          <div className="grid gap-4 md:grid-cols-2">
            <Board
              title="Най-големи дивиденти за държавата"
              icon={<ArrowInflow className="mr-2 h-5 w-5 text-inflow-600" aria-hidden />}
              items={HIGHLIGHTS.biggestDividends}
              tone="inflow"
            />
            <Board
              title="Най-големи загуби"
              icon={<ArrowOutflow className="mr-2 h-5 w-5 text-outflow-600" aria-hidden />}
              items={HIGHLIGHTS.biggestLosses}
              tone="outflow"
            />
            <Board
              title="Най-големи субсидии от бюджета"
              icon={<Banknote className="mr-2 h-5 w-5 text-outflow-600" aria-hidden />}
              items={HIGHLIGHTS.biggestSubsidies}
              tone="outflow"
            />
            <Board
              title="Най-големи работодатели"
              icon={<Building className="mr-2 h-5 w-5 text-brand-600" aria-hidden />}
              items={HIGHLIGHTS.topEmployers}
              tone="brand"
            />
          </div>
        </Section>

        <Section>
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 text-slate-700">
            <p>
              Целият сектор върна <strong>{NATIONAL.dividendToStateMln.toLocaleString("bg-BG")} млн. лв.</strong>{" "}
              дивидент на държавата, но едновременно няколко гиганта трупат загуби и субсидии.
              Виж и <Link href="/prozrachnost-indeks" className="font-medium text-brand-700 hover:underline">индекса на прозрачност</Link>,{" "}
              <Link href="/sluchai" className="font-medium text-brand-700 hover:underline">червените флагове</Link> и{" "}
              <Link href="/koncentraciya" className="font-medium text-brand-700 hover:underline">концентрацията на поръчките</Link>.
            </p>
          </div>
        </Section>
      </div>
    </>
  );
}
