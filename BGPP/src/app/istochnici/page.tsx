import type { Metadata } from "next";
import { PageHero, Section } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { External, Link as LinkIcon } from "@/components/icons";

export const metadata: Metadata = buildMetadata({
  title: "Официални източници",
  description:
    "Регистри и портали за проверка на данните за държавните предприятия: АППК, Търговски регистър, Министерство на финансите, СИГМА, Портал за отворени данни, Сметна палата.",
  path: "/istochnici",
});

type Src = { name: string; url: string; what: string };

const REGISTERS: Src[] = [
  {
    name: "Агенция за публичните предприятия и контрол (АППК)",
    url: "https://www.appk.government.bg/",
    what: "Публичен регистър на публичните предприятия, обобщени годишни доклади и политика на държавната собственост.",
  },
  {
    name: "Търговски регистър и регистър на ЮЛНЦ",
    url: "https://portal.registryagency.bg/",
    what: "Годишни финансови отчети (ГФО), ЕИК, органи на управление, вписвания и обявени актове на всяко дружество.",
  },
  {
    name: "Министерство на финансите",
    url: "https://www.minfin.bg/",
    what: "Периодични отчети за финансовото състояние на държавните предприятия и търговските дружества с над 50% държавно участие; фискална информация.",
  },
  {
    name: "СИГМА (Министерство на иновациите и растежа)",
    url: "https://sigma.midt.bg/",
    what: "Обществените поръчки на всеки възложител — договори, изпълнители и суми (изходящите пари по поръчки).",
  },
  {
    name: "Централизирана автоматизирана информационна система „Електронни обществени поръчки“ (ЦАИС ЕОП)",
    url: "https://app.eop.bg/",
    what: "Платформата на Агенцията по обществени поръчки за провеждане и публикуване на търгове.",
  },
  {
    name: "Портал за отворени данни",
    url: "https://data.egov.bg/",
    what: "Машинночетими набори от данни, публикувани от институциите — бюджети, отчети, регистри.",
  },
  {
    name: "Сметна палата",
    url: "https://www.bulnao.government.bg/",
    what: "Одитни доклади за публичните средства, включително за държавни предприятия.",
  },
  {
    name: "Комисия за енергийно и водно регулиране (КЕВР)",
    url: "https://www.dker.bg/",
    what: "Регулирани цени и решения за енергийните и ВиК дружества.",
  },
];

export default function SourcesPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "Източници", path: "/istochnici" },
        ])}
      />
      <PageHero
        eyebrow="Проверка"
        title="Официални източници"
        intro="Този сайт не заменя първичните данни — насочва към тях. Ето откъде идват фактите и къде да проверите актуалните суми сами."
        crumbs={[{ name: "Източници", path: "/istochnici" }]}
      />
      <div className="container-content py-10">
        <Section
          title="Регистри и портали"
          icon={<LinkIcon className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <ul className="grid gap-4 md:grid-cols-2">
            {REGISTERS.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{s.name}</span>
                    <External className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                  </span>
                  <span className="mt-2 text-sm text-slate-600">{s.what}</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
