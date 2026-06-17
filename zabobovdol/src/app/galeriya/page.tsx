import Link from "next/link";
import type { Metadata } from "next";
import { Camera, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Галерия — снимки на Бобов дол",
  description:
    "Снимки на град Бобов дол — стари и нови, споделени от жителите. Всяка снимка е с кредит към автора. Споделете и вашата снимка на града.",
  path: "/galeriya",
});

export default async function GalleryPage() {
  const photos = await prisma.galleryPhoto.findMany({
    where: { published: true, imageUrl: { not: "" } },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <>
      <PageHero
        eyebrow="Галерия"
        title="Снимки на Бобов дол"
        intro="Градът през очите на хората — стари и нови снимки, споделени от жителите. Всяка снимка е с кредит към автора ѝ."
        crumbs={[{ name: "Галерия", path: "/galeriya" }]}
      />

      <div className="container-content space-y-8 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-slate-600">
            Имате хубава снимка на града? Споделете я — ще я покажем с вашето име.
          </p>
          <Link href="/galeriya/nova" className="btn-primary">
            <Plus className="h-5 w-5" aria-hidden /> Добави снимка
          </Link>
        </div>

        {photos.length === 0 ? (
          <EmptyState
            title="Галерията тепърва се пълни."
            hint="Бъдете първите — споделете ваша снимка на Бобов дол (стара или нова)."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((p) => (
              <figure
                key={p.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.imageUrl}
                  alt={p.title || "Снимка на Бобов дол"}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <figcaption className="p-4">
                  {p.title && (
                    <div className="font-medium text-slate-900">{p.title}</div>
                  )}
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                    <Camera className="h-4 w-4 shrink-0" aria-hidden />
                    Снимка: {p.author || "неизвестен автор"}
                    {p.source && (
                      <>
                        {" · "}
                        <a
                          href={p.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-700 underline"
                        >
                          източник
                        </a>
                      </>
                    )}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        <p className="text-sm text-slate-500">
          Снимките са собственост на своите автори и се публикуват с тяхно съгласие.
          Ако смятате, че снимка нарушава права, пишете ни в{" "}
          <Link href="/kontakti" className="text-brand-700 underline">
            Контакти
          </Link>
          .
        </p>
      </div>
    </>
  );
}
