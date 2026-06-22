import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero, EmptyState } from "@/components/ui";
import { Callout } from "@/components/content";
import { getPublishedGallery } from "@/lib/queries";
import { GalleryForm } from "./GalleryForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Галерия",
  description: "Снимки на Дупница от хората — с кредит към авторите.",
  path: "/galeriya",
});

export default async function GaleriyaPage() {
  const photos = await getPublishedGallery();
  return (
    <>
      <JsonLd data={webPageLd({ name: "Галерия", path: "/galeriya", type: "CollectionPage" })} />
      <PageHero
        eyebrow="Снимки"
        title="Галерия"
        intro="Дупница през обектива на хората. Изпратете и вашата снимка."
        crumbs={[{ name: "Галерия", path: "/galeriya" }]}
      />
      <div className="container-content py-10">
        {photos.length === 0 ? (
          <EmptyState title="Все още няма снимки" hint="Изпратете първата снимка по-долу." />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt={p.title || "Снимка от Дупница"} className="h-48 w-full object-cover" loading="lazy" />
                <div className="p-3">
                  {p.title && <p className="font-medium text-slate-800">{p.title}</p>}
                  {p.author && <p className="text-sm text-slate-500">Автор: {p.author}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-12">
          <h2 className="section-title mb-4">Изпратете снимка</h2>
          <Callout tone="info">
            Изпращайте само снимки, които сте направили или имате право да
            споделите. Снимките се преглеждат преди публикуване.
          </Callout>
          <GalleryForm />
        </div>
      </div>
    </>
  );
}
