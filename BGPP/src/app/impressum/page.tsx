import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = buildMetadata({
  title: "Импресум",
  description: "Информация за издателя на БГ Държавни предприятия.",
  path: "/impressum",
});

export default function ImpressumPage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Начало", path: "/" }, { name: "Импресум", path: "/impressum" }])} />
      <PageHero title="Импресум" crumbs={[{ name: "Импресум", path: "/impressum" }]} />
      <div className="container-content max-w-3xl space-y-5 py-10 text-slate-600">
        <p><strong>Издател:</strong> {SITE.author}</p>
        <p>
          <strong>Уебсайт:</strong>{" "}
          <a href={SITE.authorUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
            {SITE.authorUrl}
          </a>
        </p>
        <p>
          <strong>Естество на проекта:</strong> независим граждански, образователен портал за
          прозрачност. <strong>Не е</strong> официален сайт на държавен орган, институция или
          предприятие и не изразява тяхна позиция.
        </p>
        <p>
          <strong>Съдържание:</strong> компилирано от публични официални източници. Полагаме
          усилия за точност, но не гарантираме пълнота или актуалност — за правен ефект
          сверявайте с първичните регистри. Разделът „Известни случаи“ отбелязва правния
          статус; разследване не е присъда и важи презумпцията за невиновност.
        </p>
        <p>
          <strong>Авторски права:</strong> © {new Date().getFullYear()} {SITE.author}.
          Данните може да се ползват с посочване на източника.
        </p>
      </div>
    </>
  );
}
