import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { PageHero, Prose } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { markdownToHtml } from "@/lib/markdown";

export const metadata: Metadata = buildMetadata({
  title: "За клуба",
  description:
    "ФК „Миньор“ Бобов дол — кои сме ние, нашата мисия и ценности, и за дарителя на сайта.",
  path: "/za-kluba",
});

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Кои сме ние"
        title="За клуба"
        intro="Футболен клуб с дълга миньорска традиция и силна връзка с Бобов дол."
        crumbs={[{ name: "За клуба", path: "/za-kluba" }]}
      />
      <JsonLd
        data={webPageLd({
          name: "За клуба",
          description: SITE.description,
          path: "/za-kluba",
          type: "AboutPage",
        })}
      />
      <div className="container-content max-w-3xl py-10">
        <Prose
          html={markdownToHtml(
            "## Жълто-черна гордост\n\n" +
              `**${SITE.name}** е символ на спортния дух на Бобов дол. Носим прякора **„${SITE.nickname}“** и играем в цветовете **${SITE.colors}** — отражение на миньорския труд, изградил града.\n\n` +
              "## Мисията ни\n\n" +
              "- Да развиваме футбола в Бобов дол и да даваме сцена на местните таланти.\n" +
              "- Да обединяваме общността около отбора.\n" +
              "- Да възпитаваме млади футболисти в дух на труд, чест и отборна игра.\n\n" +
              "## Стадионът\n\n" +
              `Домакинските си мачове отборът играе на **${SITE.stadium.name}** в Бобов дол.`,
          )}
        />

        <div className="mt-10 rounded-2xl border border-slate-200 bg-gold-50 p-6">
          <h2 className="font-display text-xl font-bold text-slate-900">
            Сайтът е дарение
          </h2>
          <p className="mt-2 text-slate-700">
            Този уебсайт е изработен и дарен на клуба от{" "}
            <a
              href="https://carbonstealth.eu"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-800 underline decoration-gold-400 decoration-2 underline-offset-2"
            >
              Carbon Stealth VCC
            </a>{" "}
            — в подкрепа на местния футбол и общността на Бобов дол.
          </p>
        </div>
      </div>
    </>
  );
}
