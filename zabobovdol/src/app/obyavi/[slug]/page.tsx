import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { LISTING_TYPE_LABELS, labelFor } from "@/lib/categories";

export const dynamic = "force-dynamic";

async function getListing(slug: string) {
  return prisma.listing.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const l = await getListing(slug);
  if (!l) return buildMetadata({ title: "Не е намерено", noindex: true });
  return buildMetadata({
    title: l.title,
    description: plainText(l.description, 155),
    path: `/obyavi/${l.slug}`,
    type: "article",
  });
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const l = await getListing(slug);
  if (!l) notFound();

  return (
    <>
      <PageHero
        title={l.title}
        crumbs={[
          { name: "Обяви", path: "/obyavi" },
          { name: l.title, path: `/obyavi/${l.slug}` },
        ]}
      />
      <div className="container-content grid gap-8 py-10 lg:grid-cols-[1fr,18rem]">
        <div>
          <div className="badge">{labelFor(LISTING_TYPE_LABELS, l.type)}</div>
          {l.price && (
            <div className="mt-3 text-2xl font-bold text-brand-700">{l.price}</div>
          )}
          {l.description && (
            <div className="mt-4">
              <Prose html={renderMarkdown(l.description)} />
            </div>
          )}
        </div>
        <aside>
          <div className="card space-y-3">
            <div className="text-base font-semibold text-slate-900">Контакт</div>
            {l.contactName && <div className="text-slate-700">{l.contactName}</div>}
            {l.contactPhone && (
              <a
                href={`tel:${l.contactPhone}`}
                className="block text-lg font-semibold text-brand-700"
              >
                📞 {l.contactPhone}
              </a>
            )}
            {l.contactEmail && (
              <a
                href={`mailto:${l.contactEmail}`}
                className="block break-all text-brand-700 hover:underline"
              >
                {l.contactEmail}
              </a>
            )}
            {!l.contactPhone && !l.contactEmail && (
              <p className="text-sm text-slate-500">
                Няма посочени данни за контакт.
              </p>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Внимавайте при сделки. Не превеждайте пари предварително на
            непознати. {`"За Бобов дол"`} не носи отговорност за съдържанието на
            обявите.
          </p>
        </aside>
      </div>
    </>
  );
}
