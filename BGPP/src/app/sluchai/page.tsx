import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { ShieldCheck, External, Info } from "@/components/icons";
import { CASES, STATUS, STATUS_ORDER, redFlagsByEnterprise, type CaseItem } from "@/data/cases";

export const metadata: Metadata = buildMetadata({
  title: "Известни случаи и червени флагове",
  description:
    "Документирани случаи на нередности, разследвания и одитни находки около държавните предприятия в България — с ясно отбелязан правен статус и официални източници. Разследване не е присъда.",
  path: "/sluchai",
});

const TONE: Record<string, string> = {
  red: "bg-rose-100 text-rose-800 border-rose-300",
  amber: "bg-amber-100 text-amber-800 border-amber-300",
  slate: "bg-slate-100 text-slate-700 border-slate-300",
};

function CaseCard({ c }: { c: CaseItem }) {
  const st = STATUS[c.statusKey];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-bold text-slate-900">{c.title}</h3>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE[st.tone]}`}>
          {st.label}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium text-brand-700">
        {c.slug ? (
          <Link href={`/predpriyatiya/${c.slug}`} className="hover:underline">
            {c.enterprise}
          </Link>
        ) : (
          c.enterprise
        )}
        <span className="text-slate-400"> · {c.year}</span>
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{c.desc}</p>
      {c.amount && (
        <p className="mt-2 text-sm">
          <span className="font-semibold text-slate-800">Мащаб: </span>
          <span className="text-slate-700">{c.amount}</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        {c.sources.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
          >
            {s.label}
            <External className="h-3.5 w-3.5" aria-hidden />
          </a>
        ))}
      </div>
    </div>
  );
}

export default function CasesPage() {
  const sorted = [...CASES].sort(
    (a, b) => STATUS_ORDER.indexOf(a.statusKey) - STATUS_ORDER.indexOf(b.statusKey),
  );

  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "Известни случаи", path: "/sluchai" },
        ])}
      />
      <PageHero
        eyebrow="Червени флагове"
        title="Известни случаи"
        intro="Документирани нередности, разследвания и одитни находки около държавните предприятия — с официален източник и ясно отбелязан правен статус."
        crumbs={[{ name: "Известни случаи", path: "/sluchai" }]}
      />

      <div className="container-content space-y-8 py-10">
        {/* Дисклеймър — презумпция за невиновност */}
        <div className="rounded-2xl border-l-4 border-rose-500 bg-rose-50 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-rose-600" aria-hidden />
            <h2 className="font-bold text-slate-900">Важно: разследване не е присъда</h2>
          </div>
          <p className="mt-2 text-sm text-slate-700">
            Всеки случай тук е с <strong>ясно отбелязан правен статус</strong>. Разследване,
            претърсване, обвинение, одитна находка или финансова корекция{" "}
            <strong>не установяват вина</strong> — важи презумпцията за невиновност. Нищо на
            тази страница не е твърдение за доказано престъпление на конкретно лице. Проверете
            в посочените официални източници.
          </p>
        </div>

        {/* Легенда на статусите */}
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((k) => {
            const st = STATUS[k];
            return (
              <span
                key={k}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE[st.tone]}`}
              >
                {st.label}
              </span>
            );
          })}
        </div>

        {/* Класация по брой червени флагове */}
        <Section title="Най-много червени флагове">
          <div className="grid gap-2 sm:grid-cols-2">
            {redFlagsByEnterprise()
              .filter((r) => r.count > 1)
              .map((r) => (
                <div
                  key={r.enterprise}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5"
                >
                  {r.slug ? (
                    <Link href={`/predpriyatiya/${r.slug}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {r.enterprise}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900">{r.enterprise}</span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                    {r.count} случая
                  </span>
                </div>
              ))}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Броят случаи отразява публичното внимание и наличните източници, не непременно
            установена вина. Кой печели поръчките на тези възложители — виж{" "}
            <Link href="/koncentraciya" className="font-medium text-brand-700 hover:underline">
              концентрацията
            </Link>
            .
          </p>
        </Section>

        <Section title="Всички случаи">
          <div className="grid gap-4 md:grid-cols-2">
            {sorted.map((c, i) => (
              <CaseCard key={i} c={c} />
            ))}
          </div>
        </Section>

        <Section icon={<Info className="h-6 w-6 text-brand-700" aria-hidden />}>
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 text-slate-700">
            <p>
              Най-напредналият случай към момента е <strong>обвинението на Европейската
              прокуратура</strong> по сигнализацията Пловдив–Бургас (НКЖИ). Нито един случай
              все още не е стигнал до влязла в сила осъдителна присъда.
            </p>
            <p className="mt-3 text-sm">
              Виж и <Link href="/koncentraciya" className="font-medium text-brand-700 hover:underline">концентрацията на поръчките</Link>{" "}
              и <Link href="/konflikti" className="font-medium text-brand-700 hover:underline">конфликта на интереси</Link>.
              Сигнал за нередност се подава до Сметната палата (конфликт на интереси),
              прокуратурата или Европейската прокуратура/OLAF (европейски средства).
            </p>
          </div>
        </Section>
      </div>
    </>
  );
}
