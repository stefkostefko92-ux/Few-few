import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { Callout } from "@/components/content";
import { DumpForm } from "./DumpForm";

export const metadata: Metadata = buildMetadata({
  title: "Нерегламентирани сметища",
  description:
    "Подайте сигнал за нерегламентирано (незаконно) сметище в Дупница, за да се почисти.",
  path: "/smetishta",
});

export default function SmetishtaPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Нерегламентирани сметища", path: "/smetishta" })} />
      <PageHero
        eyebrow="Чистота"
        title="Нерегламентирани сметища"
        intro="Видяхте незаконно струпан отпадък? Подайте сигнал — заедно пазим града чист."
        crumbs={[{ name: "Нерегламентирани сметища", path: "/smetishta" }]}
      />
      <div className="container-content py-10">
        <Callout tone="info">
          Сигналите се преглеждат и по възможност се препращат към общината. При
          непосредствена опасност (пожар, опасни отпадъци) се обадете на 112.
        </Callout>
        <DumpForm />
      </div>
    </>
  );
}
