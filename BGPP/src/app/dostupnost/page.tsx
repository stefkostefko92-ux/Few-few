import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Декларация за достъпност",
  description: "Как БГ Държавни предприятия работи за достъпност (WCAG 2.1 AA).",
  path: "/dostupnost",
});

export default function AccessibilityPage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Начало", path: "/" }, { name: "Достъпност", path: "/dostupnost" }])} />
      <PageHero title="Декларация за достъпност" crumbs={[{ name: "Достъпност", path: "/dostupnost" }]} />
      <div className="container-content max-w-3xl space-y-5 py-10 text-slate-600">
        <p>
          Стремим се сайтът да е достъпен за всички, в съответствие с{" "}
          <strong>WCAG 2.1, ниво AA</strong> и Европейския акт за достъпност.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>Семантичен HTML, връзка „към съдържанието“ и видим фокус при навигация с клавиатура.</li>
          <li>Текстов контраст, съобразен с AA; относителни размери за увеличение на текста.</li>
          <li>Алтернативни описания за иконите; таблиците са с ясни заглавия.</li>
          <li>Уважаваме предпочитанието „по-малко движение“ (prefers-reduced-motion).</li>
          <li>Без стробоскопични ефекти или автоматично възпроизвеждане.</li>
        </ul>
        <p>
          Достъпността е непрекъснат процес. Ако срещнете пречка, пишете ни през издателя
          (<a href="/impressum" className="font-medium text-brand-700 hover:underline">Импресум</a>),
          за да я отстраним.
        </p>
      </div>
    </>
  );
}
