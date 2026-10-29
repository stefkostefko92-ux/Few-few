import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = buildMetadata({
  title: "Политика за поверителност",
  description: "Как БГ Държавни предприятия обработва (и не обработва) лични данни.",
  path: "/poveritelnost",
});

export default function PrivacyPage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Начало", path: "/" }, { name: "Поверителност", path: "/poveritelnost" }])} />
      <PageHero title="Политика за поверителност" crumbs={[{ name: "Поверителност", path: "/poveritelnost" }]} />
      <div className="container-content max-w-3xl space-y-5 py-10 text-slate-600">
        <p>
          {SITE.name} е статичен информационен сайт. <strong>Не събираме лични данни</strong> —
          няма регистрация, форми, коментари, качване на файлове или потребителски профили.
        </p>
        <p>
          <strong>Бисквитки и проследяване:</strong> сайтът не поставя бисквитки за проследяване
          и не използва рекламни или аналитични скриптове от трети страни (виж{" "}
          <a href="/biskvitki" className="font-medium text-brand-700 hover:underline">Бисквитки</a>).
        </p>
        <p>
          <strong>Сървърни логове:</strong> хостинг доставчикът може да води технически логове
          (IP адрес, време на заявка) за сигурност и стабилност — стандартна практика, без
          профилиране.
        </p>
        <p>
          <strong>Външни връзки:</strong> сайтът сочи към официални регистри и медии. Техните
          политики за поверителност важат при посещение.
        </p>
        <p>
          <strong>Данните за държавни предприятия и лица</strong> в сайта са публично достъпни
          факти от официални регистри (обществен интерес), а не лични данни, събрани от вас.
        </p>
        <p>
          Администратор: {SITE.author} (
          <a href={SITE.authorUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
            {SITE.authorUrl}
          </a>
          ).
        </p>
      </div>
    </>
  );
}
