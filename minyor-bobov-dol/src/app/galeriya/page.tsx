import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getGallery } from "@/lib/data";
import { PageHero, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Галерия",
  description: "Снимки от мачовете и събитията на ФК „Миньор“ Бобов дол.",
  path: "/galeriya",
});

export default async function GalleryPage() {
  const photos = await getGallery();

  // Групиране по албуми, със запазен ред на първа поява.
  const albums: { name: string; photos: typeof photos }[] = [];
  for (const p of photos) {
    const name = p.album || "Общи";
    let album = albums.find((a) => a.name === name);
    if (!album) {
      album = { name, photos: [] };
      albums.push(album);
    }
    album.photos.push(p);
  }

  return (
    <>
      <PageHero
        eyebrow="Кадри"
        title="Галерия"
        intro="Моменти от мачовете и живота на клуба."
        crumbs={[{ name: "Галерия", path: "/galeriya" }]}
      />
      <div className="container-content space-y-10 py-10">
        {photos.length === 0 ? (
          <EmptyState
            title="Галерията още е празна"
            hint="Снимки от мачове и събития ще се появят тук скоро."
          />
        ) : (
          albums.map((album) => (
            <section key={album.name}>
              <h2 className="section-title mb-5">{album.name}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {album.photos.map((p) => (
                  <figure
                    key={p.id}
                    className="group overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption || "Снимка от галерията на ФК „Миньор“"}
                      className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                    {p.caption && (
                      <figcaption className="px-3 py-2 text-sm text-slate-600">
                        {p.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
