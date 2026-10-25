import Link from "next/link";
import type { Metadata } from "next";
import { Camera, Plus } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, ListToolbar, safeHttpUrl } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { ReportContent } from "@/components/ReportContent";
import { SECTION } from "@/lib/section-names";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Галерия — снимки на Бобов дол",
  description:
    "Снимки на град Бобов дол — стари и нови, споделени от жителите. Всяка снимка е с кредит към автора. Споделете и вашата снимка на града.",
  path: "/galeriya",
  keywords: [
    "снимки Бобов дол",
    "галерия Бобов дол",
    "стари снимки Бобов дол",
    "град Бобов дол снимки",
    "Бобов дол през годините",
  ],
});

const addAction = (
  <Link href="/galeriya/nova" className="btn-primary">
    <Plus className="h-5 w-5" aria-hidden />
    Добавете снимка
  </Link>
);

export default async function GalleryPage() {
  const photos = await prisma.galleryPhoto.findMany({
    where: { published: true, imageUrl: { not: "" } },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <>
      <PageHero
        eyebrow={SECTION.city}
        title="Снимки на Бобов дол"
        intro="Градът през очите на хората — стари и нови снимки, споделени от жителите. Всяка снимка е с кредит към автора ѝ."
        crumbs={[{ name: "Галерия", path: "/galeriya" }]}
      />

      <div className="container-content py-10">
        {photos.length === 0 ? (
          <EmptyState
            icon={Camera}
            title="Галерията тепърва се пълни."
            hint="Бъдете първите — споделете ваша снимка на Бобов дол (стара или нова)."
            action={addAction}
          />
        ) : (
          <>
            <ListToolbar
              count="Имате хубава снимка на града? Споделете я — ще я покажем с вашето име."
              action={addAction}
            />
            <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((p) => {
                const source = safeHttpUrl(p.source);
                return (
                  <li key={p.id}>
                    <figure className="panel h-full overflow-hidden p-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.imageUrl}
                        alt={p.title || "Снимка на Бобов дол"}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <figcaption className="p-4">
                        {p.title && <p className="h-card text-base">{p.title}</p>}
                        <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600">
                          <Camera className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          <span>
                            Снимка: {p.author || "неизвестен автор"}
                            {source && (
                              <>
                                {"\u00a0· "}
                                <a
                                  href={source.toString()}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="link"
                                >
                                  източник
                                  <span className="sr-only"> (отваря се в нов раздел)</span>
                                </a>
                              </>
                            )}
                          </span>
                        </p>
                      </figcaption>
                    </figure>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <p className="mt-10 max-w-3xl text-base text-slate-600">
          Снимките са собственост на своите автори и се публикуват с тяхно съгласие. Ако
          смятате, че снимка нарушава права, пишете ни в{" "}
          <Link href="/kontakti" className="link">
            Контакти
          </Link>
          .
        </p>
        {/* Сигнал за съдържание — само когато има какво да се сигнализира. */}
        {photos.length > 0 && <ReportContent subject="Снимка в галерията (посочете коя — заглавие или автор)" path="/galeriya" />}
      </div>
    </>
  );
}
