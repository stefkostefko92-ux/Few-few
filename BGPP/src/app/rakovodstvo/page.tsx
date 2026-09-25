import type { Metadata } from "next";
import { PageHero, Section } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { Search, External } from "@/components/icons";

export const metadata: Metadata = buildMetadata({
  title: "Как да провериш сам",
  description:
    "Кратко ръководство: как да провериш държавно предприятие или фирма-изпълнител — Търговски регистър, регистър на действителните собственици, СИГМА, отчети.",
  path: "/rakovodstvo",
});

const STEPS = [
  {
    t: "1. Намери фирмата по ЕИК/име",
    d: "Търговски регистър (portal.registryagency.bg) — управители, съдружници, история, обявени актове и годишни финансови отчети (ГФО).",
    url: "https://portal.registryagency.bg/",
    link: "Търговски регистър",
  },
  {
    t: "2. Кой реално стои зад нея",
    d: "Регистър на действителните собственици (по ЗМИП) — физическите лица зад дружеството, дори през холдинги и офшорки.",
    url: "https://portal.registryagency.bg/",
    link: "Регистър на действителните собственици",
  },
  {
    t: "3. Какви поръчки печели",
    d: "СИГМА и ЦАИС ЕОП — договори по възложител, суми, изпълнители, обособени позиции.",
    url: "https://sigma.midt.bg/",
    link: "СИГМА",
  },
  {
    t: "4. Как се представя финансово",
    d: "ГФО в Търговския регистър и (за държавните) Годишният обобщен доклад на АППК + отчетите на Министерството на финансите.",
    url: "https://appk.government.bg/bg/55",
    link: "АППК — доклади",
  },
  {
    t: "5. Има ли проблеми",
    d: "Одитни доклади на Сметната палата, решения на КЗК, съобщения на ЕППО/OLAF, регистър на декларациите (register.cacbg.bg).",
    url: "https://www.bulnao.government.bg/",
    link: "Сметна палата",
  },
];

export default function GuidePage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "Как да провериш", path: "/rakovodstvo" },
        ])}
      />
      <PageHero
        eyebrow="Ръководство"
        title="Как да провериш сам"
        intro="Пет стъпки, с които всеки гражданин или журналист може да провери държавно предприятие или фирма-изпълнител през първичните регистри."
        crumbs={[{ name: "Как да провериш", path: "/rakovodstvo" }]}
      />
      <div className="container-content py-10">
        <Section title="Пет стъпки" icon={<Search className="h-6 w-6 text-brand-700" aria-hidden />}>
          <ol className="space-y-4">
            {STEPS.map((s) => (
              <li key={s.t} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-bold text-slate-900">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.d}</p>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
                >
                  {s.link}
                  <External className="h-3.5 w-3.5" aria-hidden />
                </a>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}
