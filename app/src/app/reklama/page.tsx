import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { Callout } from "@/components/content";
import { AdForm } from "./AdForm";

export const metadata: Metadata = buildMetadata({
  title: "Реклама",
  description:
    "Подкрепете местния портал и достигнете до жителите на Дупница. Заявете реклама на местния си бизнес.",
  path: "/reklama",
});

export default function ReklamaPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Реклама", path: "/reklama" })} />
      <PageHero
        eyebrow="Подкрепа"
        title="Реклама"
        intro="Малка реклама на местен бизнес помага на портала да остане безплатен и полезен за всички."
        crumbs={[{ name: "Реклама", path: "/reklama" }]}
      />
      <div className="container-content py-10">
        <div className="prose-content max-w-3xl text-slate-700">
          <h2>Защо тук</h2>
          <p>
            Порталът се чете от хора от Дупница, които търсят местни услуги и
            телефони. Дискретна, ненатрапчива реклама на местен бизнес стига до тях
            и подкрепя проекта.
          </p>
          <h2>Как става</h2>
          <p>
            Оставете контакт чрез формата по-долу и ще се свържем с вас за детайлите
            и условията.
          </p>
        </div>

        <Callout tone="info">
          Не показваме проследяващи реклами и не пускаме реклама, която може да
          подведе или навреди на читателите.
        </Callout>

        <h2 className="section-title mb-4 mt-4">Заявка за реклама</h2>
        <AdForm />
      </div>
    </>
  );
}
