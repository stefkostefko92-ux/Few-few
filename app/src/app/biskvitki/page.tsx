import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";

export const metadata: Metadata = buildMetadata({
  title: "Бисквитки",
  description:
    "Как „За Дупница“ използва (минимално) бисквитки и локално съхранение.",
  path: "/biskvitki",
});

export default function CookiesPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Бисквитки", path: "/biskvitki" })} />
      <PageHero
        eyebrow="Правила"
        title="Бисквитки"
        intro="Накратко: ползваме минимум и не ви проследяваме за реклама."
        crumbs={[{ name: "Бисквитки", path: "/biskvitki" }]}
      />
      <div className="container-content py-10">
        <div className="prose-content max-w-3xl text-slate-700">
          <h2>Какво пазим</h2>
          <p>
            За да запомним избора ви за достъпност (размер на текста, контраст,
            тъмен режим), ползваме локално съхранение във вашия браузър. Това
            остава на вашето устройство и не се изпраща до нас.
          </p>
          <h2>Реклами и проследяване</h2>
          <p>
            Не ползваме рекламни или проследяващи бисквитки. Ако е включена
            анонимна статистика за посещенията, тя работи без бисквитки.
          </p>
          <h2>Как да изчистите данните</h2>
          <p>
            Можете по всяко време да изчистите локалните данни от настройките на
            браузъра си. Това просто ще нулира предпочитанията за достъпност.
          </p>
        </div>
      </div>
    </>
  );
}
