import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section, Badge } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { Scale, ArrowOutflow, Info } from "@/components/icons";
import { withConflicts } from "@/lib/aggregate";
import { sector as getSector } from "@/data/sectors";

export const metadata: Metadata = buildMetadata({
  title: "Конфликт на интереси",
  description:
    "Къде отиват парите на държавните предприятия и къде възниква конфликт на интереси: вътрешно (in-house) възлагане без търг, концесии към частни оператори, холдингова непрозрачност, свързани лица и политически назначения.",
  path: "/konflikti",
});

// Структурни модели на конфликт на интереси (systemic, не персонални обвинения).
const PATTERNS = [
  {
    title: "Вътрешно (in-house) възлагане без търг",
    body: "Държавата възлага договори за милиони директно на собственото си дружество, без обществена поръчка. Възложител и изпълнител са в една ръка — конкуренцията и ценовият контрол отпадат, а работата често се преотдава на частни подизпълнители.",
    examples: "„Автомагистрали“ ЕАД (пътно строителство), „Информационно обслужване“ АД (държавен софтуер), ТСВ/ССВ (ж.п. и съобщително строителство).",
  },
  {
    title: "Концесии — парите излизат към частен оператор",
    body: "Държавата запазва собствеността, но приходоносната дейност се оперира от частен концесионер срещу възнаграждение. Ползата за обществото зависи изцяло от условията на концесионния договор, които рядко са напълно публични.",
    examples: "Летище София („СОФ Кънект“), Пристанище Бургас („БМФ Порт Бургас“).",
  },
  {
    title: "Холдингова непрозрачност",
    body: "Активите се държат едно ниво по-надолу — в холдинг. Консолидираните отчети замъгляват конкретните потоци, а принципалът губи пряк контрол. Сметната палата установи, че над 56% от активите на дружествата с принципал икономиката не се контролират пряко.",
    examples: "Държавна консолидационна компания (ДКК), група „Български енергиен холдинг“ (БЕХ).",
  },
  {
    title: "Свързани лица и непрозрачни поръчки",
    body: "Договори към фирми, свързани с ръководството; дублиращи се или липсващи договори; разходване без обществени поръчки. Секторите с ограничена публичност (отбрана, преструктуриране) са особено рискови.",
    examples: "„Кинтекс“ ЕАД (отбранителна търговия), „Еко Антрацит“ ЕАД (~120 млн. лв. без поръчки, по медийни данни).",
  },
  {
    title: "Политически назначения и „въртяща се врата“",
    body: "Бордовете на държавните дружества често се сменят при смяна на властта. Изискванията за независими членове по Закона за публичните предприятия целят да ограничат това, но прилагането е неравномерно.",
    examples: "Повтарящи се смени в бордовете на енергийни и спортни дружества.",
  },
  {
    title: "Вътрешногрупови трансфери между печеливши и губещи",
    body: "Печалбите на едни дружества покриват загубите на други в същата група — какво точно се преразпределя е трудно проследимо отвън.",
    examples: "В групата БЕХ печалбите на АЕЦ и ЕСО покриват загубите на НЕК и ТЕЦ „Марица изток 2“.",
  },
];

export default function ConflictsPage() {
  const flagged = withConflicts();

  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "Конфликт на интереси", path: "/konflikti" },
        ])}
      />
      <PageHero
        eyebrow="Къде отиват парите"
        title="Конфликт на интереси"
        intro="Прегледахме къде възниква конфликт на интереси в държавните предприятия и в местата, където отиват парите им. Тук са структурните модели — систематични рискове, а не обвинения срещу конкретни хора."
        crumbs={[{ name: "Конфликт на интереси", path: "/konflikti" }]}
      />

      <div className="container-content space-y-12 py-10">
        <Section title="Шест структурни модела" icon={<Scale className="h-6 w-6 text-rose-600" aria-hidden />}>
          <div className="grid gap-4 md:grid-cols-2">
            {PATTERNS.map((p) => (
              <div key={p.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-bold text-slate-900">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.body}</p>
                <p className="mt-3 text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">Примери: </span>
                  {p.examples}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* Конкретни предприятия с отбелязан конфликт */}
        <Section
          title={`Предприятия с отбелязан конфликт (${flagged.length})`}
          icon={<ArrowOutflow className="h-6 w-6 text-rose-600" aria-hidden />}
        >
          <div className="space-y-4">
            {flagged.map((e) => (
              <div key={e.slug} className="rounded-xl border border-rose-200 bg-rose-50/50 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/predpriyatiya/${e.slug}`} className="text-lg font-bold text-slate-900 hover:text-brand-700">
                    {e.shortName ?? e.name}
                  </Link>
                  <Badge tone="brand">{getSector(e.sector).short}</Badge>
                </div>
                <ul className="mt-3 space-y-2">
                  {e.conflicts!.map((c, i) => (
                    <li key={i} className="border-l-4 border-rose-500 bg-white/70 p-3 text-sm text-slate-800">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section icon={<Info className="h-6 w-6 text-brand-700" aria-hidden />}>
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6">
            <h2 className="text-lg font-bold text-slate-900">Как да проверите сами</h2>
            <p className="mt-2 text-slate-700">
              Конкретните договори и изпълнители се виждат в{" "}
              <a href="https://sigma.midt.bg/" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                СИГМА
              </a>{" "}
              (обществени поръчки) и в{" "}
              <a href="https://app.eop.bg/" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                ЦАИС ЕОП
              </a>
              . Свързаността на лица се проверява през{" "}
              <a href="https://portal.registryagency.bg/" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                Търговския регистър
              </a>
              , а одитите — при{" "}
              <a href="https://www.bulnao.government.bg/" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                Сметната палата
              </a>
              .
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Този раздел описва <strong>структурни рискове</strong>, установени от официални одити и разследвания. Той не твърди извършено престъпление от конкретно лице — за това са компетентни органите.
            </p>
          </div>
        </Section>
      </div>
    </>
  );
}
