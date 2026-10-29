import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Политика за бисквитки",
  description: "Този сайт не използва бисквитки за проследяване.",
  path: "/biskvitki",
});

export default function CookiesPage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Начало", path: "/" }, { name: "Бисквитки", path: "/biskvitki" }])} />
      <PageHero title="Политика за бисквитки" crumbs={[{ name: "Бисквитки", path: "/biskvitki" }]} />
      <div className="container-content max-w-3xl space-y-5 py-10 text-slate-600">
        <p>
          Този сайт <strong>не използва бисквитки за проследяване, реклама или анализ</strong>.
          Затова няма банер за съгласие — няма за какво да дадете съгласие.
        </p>
        <p>
          Не се зареждат скриптове от трети страни (без Google Analytics, без пиксели на
          социални мрежи, без рекламни мрежи).
        </p>
        <p>
          Ако в бъдеще бъде добавена анонимна статистика, тя ще е без бисквитки и без лични
          данни, а тази страница ще бъде обновена.
        </p>
      </div>
    </>
  );
}
