import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { Scale, Search, Info } from "@/components/icons";

export const metadata: Metadata = buildMetadata({
  title: "Проверка на свързаност",
  description:
    "Метод и отворен инструмент за откриване на сигнали за свързаност между ръководителите на държавни предприятия и собствениците на фирмите-изпълнители — без обвинения, само поводи за проверка с документ.",
  path: "/svarzanost",
});

const SIGNALS = [
  {
    type: "Също лице",
    strength: "силен",
    desc: "И трите имена съвпадат — възможно е едно и също лице да е от двете страни на сделката (пряка несъвместимост).",
  },
  {
    type: "Родител → дете",
    strength: "силен",
    desc: "Бащиното име на единия сочи собственото име на другия И фамилиите съвпадат — възможна връзка родител–дете.",
  },
  {
    type: "Обща фамилия / често име",
    strength: "слаб",
    desc: "Съвпада само фамилията или често лично име (Георгиев, Иванов…) — почти винаги съвпадение, не връзка.",
  },
];

export default function ConnectionsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "Проверка на свързаност", path: "/svarzanost" },
        ])}
      />
      <PageHero
        eyebrow="Метод и инструмент"
        title="Проверка на свързаност"
        intro="Как да проверим дали на висок пост в държавно предприятие седи свързано лице на собственик на фирма-изпълнител — коректно, през първичните регистри, без обвинения срещу конкретни хора."
        crumbs={[{ name: "Проверка на свързаност", path: "/svarzanost" }]}
      />

      <div className="container-content space-y-12 py-10">
        <Section
          title="Логиката: българското име издава бащата"
          icon={<Scale className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <p className="max-w-3xl text-slate-600">
            Българското име е <strong>Собствено + Бащино + Фамилно</strong>, а бащиното е
            производно от собственото име на бащата (Петър → Петров). Затова съпоставяне на
            имената на органите на държавно предприятие с действителните собственици на
            изпълнителите дава три вида сигнал:
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {SIGNALS.map((s) => (
              <div key={s.type} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">{s.type}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      s.strength === "силен"
                        ? "bg-outflow-100 text-outflow-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {s.strength}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Отвореният инструмент"
          icon={<Search className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <p className="max-w-3xl text-slate-600">
            В хранилището на проекта има малък скрипт (<code>tools/svarzanost</code>), който
            приема два списъка — органите на държавното предприятие и собствениците на
            изпълнителите — и маркира съвпаденията като <strong>сигнали за проверка</strong>.
            Работи офлайн, върху данни, които ти събираш от регистрите, и никога не твърди
            роднинство.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 p-4 text-sm text-slate-100">
            <code>node tools/svarzanost/check.mjs лица.json изпълнители.json</code>
          </pre>
          <p className="mt-3 text-sm text-slate-500">
            Изходът класира сигналите по сила и добавя чеклист как да ги докажеш с документ.
            Честно предупреждение: при много чести имена дори „силен“ сигнал е вероятно
            съвпадение — инструментът сам ги понижава.
          </p>
        </Section>

        <Section
          title="Какво показа проверката на практика"
          icon={<Info className="h-6 w-6 text-brand-700" aria-hidden />}
        >
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 text-slate-700">
            <p>
              Пуснахме метода върху ~20 от най-едрите държавни дружества (над 6 млрд. €
              поръчки), проследени до крайните физически собственици. Резултат:{" "}
              <strong>нито един солиден сигнал</strong> — само шум на чести имена.
            </p>
            <p className="mt-3 text-sm">
              Това не доказва, че няма свързаност — доказва, че по публично проверимите данни
              не се вижда. Същинското доказателство е декларацията за интереси на лицето или
              акт на проверяващия орган. Реалната находка беше друга —{" "}
              <Link href="/koncentraciya" className="font-medium text-brand-700 hover:underline">
                концентрацията
              </Link>{" "}
              на поръчките в няколко частни групи.
            </p>
          </div>
        </Section>
      </div>
    </>
  );
}
