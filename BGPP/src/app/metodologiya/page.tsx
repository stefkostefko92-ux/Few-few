import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { Info } from "@/components/icons";
import { totalEnterprises } from "@/lib/aggregate";

export const metadata: Metadata = buildMetadata({
  title: "Методология и обхват",
  description:
    "Как е събран каталогът на държавните предприятия, какъв е обхватът, кои са уговорките за точност и как да съобщите корекция.",
  path: "/metodologiya",
});

export default function MethodologyPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "Методология", path: "/metodologiya" },
        ])}
      />
      <PageHero
        eyebrow="Прозрачност за прозрачността"
        title="Методология и обхват"
        intro="Честно за това какво съдържа проектът, какво не съдържа и как да го проверите."
        crumbs={[{ name: "Методология", path: "/metodologiya" }]}
      />

      <div className="container-content max-w-3xl space-y-10 py-10">
        <Section title="Какво е това">
          <p className="text-slate-600">
            Независим граждански справочник, който описва{" "}
            <strong>структурата</strong> на държавните предприятия в България —
            кой ги контролира и по какъв начин влизат и излизат парите им. Целта е
            разбираемост за гражданина, не официална статистика.
          </p>
        </Section>

        <Section title="Обхват">
          <ul className="list-disc space-y-2 pl-6 text-slate-600">
            <li>
              Включени са {totalEnterprises()} от най-значимите държавни
              предприятия и групи по стойност на активите и обществена важност
              (енергетика, транспорт, отбрана, гори, води, здравеопазване и др.).
            </li>
            <li>
              Някои записи са <strong>групи</strong> (напр. шестте държавни горски
              предприятия или университетските болници), описани заедно заради
              обща роля и модел на финансиране.
            </li>
            <li>
              <strong>Не е</strong> изчерпателен списък на всички стотици дружества
              с държавно и общинско участие. Пълните регистри са в АППК и
              Търговския регистър.
            </li>
          </ul>
        </Section>

        <Section
          title="Точност и уговорки"
          icon={<Info className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <div className="rounded-xl border-l-4 border-outflow-400 bg-outflow-50 p-5 text-slate-700">
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Акцентът е върху <strong>видовете</strong> парични потоци (откъде
                и накъде), които са устойчиви във времето — а не върху конкретни
                годишни суми, които се менят всяка година.
              </li>
              <li>
                Където посочваме ориентировъчна сума, тя е с година и източник.
                При липса на сигурност предпочитаме да не даваме число, а да
                насочим към официалния отчет.
              </li>
              <li>
                ЕИК и официален уебсайт се показват само когато са потвърдени.
              </li>
              <li>
                Структурата на принципалите (кой министър отговаря) може да се
                промени при правителствени преустройства — винаги проверявайте в
                АППК.
              </li>
            </ul>
          </div>
        </Section>

        <Section title="Източници">
          <p className="text-slate-600">
            Данните стъпват на официални публични регистри и портали. Пълният
            списък е на страницата{" "}
            <Link href="/istochnici" className="font-medium text-brand-700 hover:underline">
              Източници
            </Link>
            . Всяка страница на предприятие има собствен списък с връзки за
            проверка.
          </p>
        </Section>

        <Section title="Корекции">
          <p className="text-slate-600">
            Забелязали сте неточност или липсващо предприятие? Проектът се
            поддържа от {" "}
            <a
              href="https://carbonstealth.eu"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-700 hover:underline"
            >
              Carbon Stealth VCC
            </a>
            . Данните живеят в отворен вид в кода на проекта и се обновяват при
            подадена корекция с източник.
          </p>
        </Section>
      </div>
    </>
  );
}
