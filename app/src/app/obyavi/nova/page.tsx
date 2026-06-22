import Link from "next/link";
import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { ListingForm } from "./ListingForm";

export const metadata: Metadata = buildMetadata({
  title: "Подай обява",
  description: "Подайте безплатна местна обява за Дупница.",
  path: "/obyavi/nova",
  noindex: true,
});

export default function NovaObyavaPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Подай обява", path: "/obyavi/nova" })} />
      <PageHero
        eyebrow="Обяви"
        title="Подай обява"
        intro="Попълнете формата. Преглеждаме обявите, преди да ги публикуваме, за да няма спам."
        crumbs={[
          { name: "Обяви", path: "/obyavi" },
          { name: "Подай обява", path: "/obyavi/nova" },
        ]}
      />

      <div className="container-content py-10">
        <ListingForm />
        <p className="mt-6">
          <Link href="/obyavi" className="btn-secondary">
            ← Към обявите
          </Link>
        </p>
      </div>
    </>
  );
}
