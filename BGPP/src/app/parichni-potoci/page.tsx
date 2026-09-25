import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { MoneyFlowColumn } from "@/components/MoneyFlows";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { ArrowInflow, ArrowOutflow, Scale, ShieldCheck } from "@/components/icons";

export const metadata: Metadata = buildMetadata({
  title: "Как влизат и излизат парите",
  description:
    "Обяснение на паричните потоци и управлението на държавните предприятия в България: приходи, субсидии, капитал, разходи, дивиденти и правната рамка (Закон за публичните предприятия, АППК).",
  path: "/parichni-potoci",
});

const IN = [
  { label: "Приходи от дейността", note: "продажба на ток, газ, вода, превози, услуги — по пазарни или регулирани цени", weight: 1 as const },
  { label: "Регулирани такси", note: "мрежови (ЕСО, Булгартрансгаз), пристанищни (ДППИ), аеронавигационни (ДП РВД)", weight: 1 as const },
  { label: "Субсидии и компенсации", note: "от държавния бюджет — за обществени услуги (напр. пътнически влакове) и инфраструктура", weight: 2 as const },
  { label: "Капиталови вноски", note: "държавата увеличава капитала на дружеството (при загуба или голяма инвестиция)", weight: 2 as const },
  { label: "Заеми и облигации", note: "банково и облигационно финансиране на инвестиции", weight: 3 as const },
  { label: "Средства от ЕС", note: "оперативни програми, Механизъм за възстановяване и устойчивост", weight: 3 as const },
];

const OUT = [
  { label: "Оперативни разходи", note: "материали, гориво, енергия, ремонти, външни услуги", weight: 1 as const },
  { label: "Работни заплати и осигуровки", weight: 1 as const },
  { label: "Инвестиции (CAPEX)", note: "нови мощности, машини, инфраструктура, модернизация", weight: 2 as const },
  { label: "Данъци и такси", note: "корпоративен данък, концесионни и екологични такси, ETS квоти", weight: 2 as const },
  { label: "Дивидент към държавата", note: "част от печалбата се внася в държавния бюджет като приход на собственика", weight: 2 as const },
  { label: "Обслужване на дълга", note: "лихви и погасяване на главници", weight: 3 as const },
];

export default function MoneyFlowsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "Паричните потоци", path: "/parichni-potoci" },
        ])}
      />
      <PageHero
        eyebrow="Обяснение"
        title="Как влизат и излизат парите"
        intro="Държавните предприятия са търговски дружества (или държавни предприятия по специален закон), но собственик е държавата. Затова паричните им потоци смесват пазарна логика с публичен интерес и контрол."
        crumbs={[{ name: "Паричните потоци", path: "/parichni-potoci" }]}
      />

      <div className="container-content space-y-14 py-10">
        <Section
          title="Двете посоки на парите"
          icon={<ArrowInflow className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <MoneyFlowColumn kind="in" flows={IN} />
            <MoneyFlowColumn kind="out" flows={OUT} />
          </div>
        </Section>

        <Section
          title="Финансовият резултат и връзката с бюджета"
          icon={<ArrowOutflow className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <div className="prose-bg max-w-3xl space-y-4">
            <p>
              Разликата между входящите и изходящите потоци е{" "}
              <strong>финансовият резултат</strong> — печалба или загуба. Тук
              собствеността на държавата се вижда най-ясно:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-slate-600">
              <li>
                <strong>При печалба</strong> предприятието обикновено внася{" "}
                <strong>дивидент</strong> в държавния бюджет. Размерът се определя
                ежегодно с акт на Министерския съвет (разпореждане каква част от
                печалбата се разпределя).
              </li>
              <li>
                <strong>При загуба или голяма инвестиция</strong> държавата може
                да направи <strong>капиталова вноска</strong> или да гарантира
                заем — тоест парите текат в обратна посока, от бюджета към
                дружеството.
              </li>
              <li>
                <strong>Обществените услуги</strong> (напр. пътническите влакове
                или универсалната пощенска услуга) се компенсират по договор,
                защото цените не покриват разходите.
              </li>
            </ul>
          </div>
        </Section>

        <Section
          title="Правната рамка на управлението"
          icon={<Scale className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FrameCard title="Закон за публичните предприятия (ЗПП)">
              Определя как се управляват дружествата с държавно и общинско
              участие: назначаване на органи, изисквания за независими членове в
              съветите, бизнес програми, отчетност и прозрачност. Стъпва върху{" "}
              Насоките на ОИСР за корпоративно управление на държавните
              предприятия.
            </FrameCard>
            <FrameCard title="Агенция за публичните предприятия и контрол (АППК)">
              Централно звено за мониторинг: води публичен регистър, координира
              политиката на собственост и следи за прилагането на добрите
              практики. Не замества принципала (ресорния министър), а го
              наблюдава.
            </FrameCard>
            <FrameCard title="Принципал (ресорен министър)">
              Упражнява правата на държавата като собственик в конкретното
              дружество — гласува на общото събрание, назначава ръководство,
              одобрява бизнес програмата и разпределението на печалбата.
            </FrameCard>
            <FrameCard title="Външен контрол и одит">
              Сметната палата одитира публичните средства; независим финансов
              одит заверява годишните отчети; регулаторите (КЕВР, КРС, отраслови
              агенции) следят цените и правилата в естествените монополи.
            </FrameCard>
          </div>
        </Section>

        <Section
          title="Къде прозрачността се къса"
          icon={<ShieldCheck className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <ul className="space-y-2">
            {[
              "Вътрешно (in-house) възлагане — държавни дружества получават договори без публичен търг (напр. пътно строителство, държавен IT), което намалява конкуренцията и видимостта.",
              "Холдингови структури — консолидираните отчети (БЕХ, ДКК, Холдинг БДЖ) правят проследяването на конкретни пера по-трудно.",
              "Забавени отчети — годишните финансови отчети често се публикуват със закъснение в Търговския регистър.",
              "Разнородни портфейли — дружества като ДКК държат много и различни активи, което размива отговорността.",
            ].map((t, i) => (
              <li
                key={i}
                className="rounded-lg border-l-4 border-outflow-400 bg-outflow-50 p-3 text-slate-700"
              >
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-slate-600">
            Затова всяка страница на предприятие тук сочи директно към официалните
            регистри —{" "}
            <Link href="/istochnici" className="font-medium text-brand-700 hover:underline">
              виж всички източници
            </Link>
            .
          </p>
        </Section>
      </div>
    </>
  );
}

function FrameCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{children}</p>
    </div>
  );
}
