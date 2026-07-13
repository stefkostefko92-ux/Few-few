import Link from "next/link";
import { SITE } from "@/lib/site";
import {
  totalEnterprises,
  countBySector,
  countByPrincipal,
  withWebsite,
} from "@/lib/aggregate";
import { SECTORS } from "@/data/sectors";
import { StatCard, Section, Badge } from "@/components/ui";
import { MoneyFlowColumn } from "@/components/MoneyFlows";
import {
  Building,
  Layers,
  ShieldCheck,
  Eye,
  ArrowInflow,
  ArrowOutflow,
} from "@/components/icons";

// Примерен, обобщен модел на паричните потоци — показва как ЧЕТЕ страницата на
// всяко предприятие. Стойностите тук са илюстративни (типови пера), не за
// конкретно дружество.
const GENERIC_IN = [
  { label: "Продажби на пазара", note: "стоки и услуги — ток, газ, превози, вода", weight: 1 as const },
  { label: "Регулирани такси", note: "мрежови, пристанищни, аеронавигационни", weight: 2 as const },
  { label: "Субсидии и компенсации от бюджета", note: "за обществени услуги и инфраструктура", weight: 2 as const },
  { label: "Капитал и заеми", note: "вноски от държавата, банкови и облигационни заеми, средства от ЕС", weight: 3 as const },
];
const GENERIC_OUT = [
  { label: "Оперативни разходи", note: "материали, гориво, енергия, поддръжка", weight: 1 as const },
  { label: "Работни заплати и осигуровки", weight: 1 as const },
  { label: "Инвестиции", note: "нови мощности, инфраструктура, модернизация", weight: 2 as const },
  { label: "Дивидент към държавния бюджет", note: "част от печалбата се връща на държавата-собственик", weight: 2 as const },
  { label: "Обслужване на дълга", note: "лихви и главници", weight: 3 as const },
];

export default function HomePage() {
  const total = totalEnterprises();
  const bySector = countBySector();
  const byPrincipal = countByPrincipal();

  return (
    <>
      {/* Hero */}
      <section className="border-b border-slate-200 bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="container-content py-14 sm:py-20">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-800">
            <Eye className="h-4 w-4" aria-hidden />
            Прозрачност на държавната собственост
          </p>
          <h1 className="max-w-4xl text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl">
            Къде влизат и къде излизат парите на държавните предприятия в България
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            {SITE.name} събира на едно място кои са държавните предприятия, кой
            министър ги контролира и — най-важното — по какъв начин влизат и
            излизат парите им. Всяка карта сочи към официалните регистри, за да
            проверите сами.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/predpriyatiya" className="btn-primary">
              Разгледай предприятията
            </Link>
            <Link href="/parichni-potoci" className="btn-secondary">
              Как влизат и излизат парите
            </Link>
          </div>
        </div>
      </section>

      <div className="container-content space-y-16 py-14">
        {/* Обобщени показатели */}
        <Section>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              value={total}
              label="профилирани предприятия и групи"
              icon={<Building className="h-7 w-7" aria-hidden />}
            />
            <StatCard
              value={bySector.length}
              label="сектора на дейност"
              icon={<Layers className="h-7 w-7" aria-hidden />}
            />
            <StatCard
              value={byPrincipal.length}
              label="министерства-принципали"
              icon={<ShieldCheck className="h-7 w-7" aria-hidden />}
            />
            <StatCard
              value={withWebsite()}
              label="с връзка към официален сайт"
              icon={<Eye className="h-7 w-7" aria-hidden />}
            />
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Обхватът включва най-значимите държавни предприятия по стойност на
            активите. Не е изчерпателен списък на всички дружества с държавно
            участие — виж{" "}
            <Link href="/metodologiya" className="font-medium text-brand-700 hover:underline">
              методологията
            </Link>
            .
          </p>
        </Section>

        {/* Общ модел на паричните потоци */}
        <Section
          title="Общият модел: две посоки на парите"
          icon={<ArrowInflow className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <p className="mb-6 max-w-3xl text-slate-600">
            Почти всяко държавно предприятие има едни и същи типове входящи и
            изходящи потоци. На страницата на всяко дружество ги показваме
            конкретно; ето общата рамка:
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <MoneyFlowColumn kind="in" flows={GENERIC_IN} />
            <MoneyFlowColumn kind="out" flows={GENERIC_OUT} />
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Разликата между входящите и изходящите потоци е финансовият резултат
            (печалба или загуба). При печалба държавата обикновено получава{" "}
            <strong>дивидент</strong>; при загуба често се стига до{" "}
            <strong>капиталова подкрепа</strong> от бюджета.
          </p>
        </Section>

        {/* Сектори */}
        <Section
          title="По сектори"
          icon={<Layers className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SECTORS.filter((s) => bySector.some((b) => b.key === s.key)).map(
              (s) => {
                const count = bySector.find((b) => b.key === s.key)?.count ?? 0;
                return (
                  <Link
                    key={s.key}
                    href={`/predpriyatiya?sector=${s.key}`}
                    className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 group-hover:text-brand-700">
                        {s.name}
                      </h3>
                      <Badge tone="brand">{count}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                      {s.description}
                    </p>
                  </Link>
                );
              },
            )}
          </div>
        </Section>

        {/* Призив за коректност */}
        <Section>
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6">
            <div className="flex items-center gap-2">
              <ArrowOutflow className="h-5 w-5 text-brand-700" aria-hidden />
              <h2 className="text-lg font-bold text-slate-900">
                Данните са отправна точка, не присъда
              </h2>
            </div>
            <p className="mt-2 max-w-3xl text-slate-700">
              Целта на проекта е гражданинът да разбере <em>структурата</em> —
              откъде идват и накъде отиват публичните пари в тези дружества.
              Конкретните годишни суми се менят и се проверяват в официалните
              отчети. Всяка страница сочи директно към тях.
            </p>
            <Link href="/istochnici" className="btn-primary mt-4">
              Виж официалните източници
            </Link>
          </div>
        </Section>
      </div>
    </>
  );
}
