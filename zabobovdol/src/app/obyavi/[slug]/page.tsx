import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ContactPanel, DetailActions, Notice, PageHero, Prose } from "@/components/ui";
import { buildMetadata, canonical } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { LISTING_TYPE_LABELS, labelFor } from "@/lib/categories";
import { ReportContent } from "@/components/ReportContent";

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
    keywords: [
      l.title,
      `${labelFor(LISTING_TYPE_LABELS, l.type)} Бобов дол`,
      "обяви Бобов дол",
      "безплатни обяви Бобов дол",
      "местни обяви",
    ],
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

  // Структурирани данни за обявата (Product/Offer) — за богати резултати.
  const priceNum = parseFloat((l.price || "").replace(/[^\d.,]/g, "").replace(",", "."));
  const currency = /€|евро|eur/i.test(l.price || "") ? "EUR" : "BGN";
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: l.title,
    ...(l.description ? { description: plainText(l.description, 300) } : {}),
    ...(Number.isFinite(priceNum) && priceNum > 0
      ? {
          offers: {
            "@type": "Offer",
            price: priceNum,
            priceCurrency: currency,
            availability: "https://schema.org/InStock",
            url: canonical(`/obyavi/${l.slug}`),
          },
        }
      : {}),
  };

  return (
    <>
      <JsonLd data={productLd} />
      <PageHero
        title={l.title}
        crumbs={[
          { name: "Обяви", path: "/obyavi" },
          { name: l.title, path: `/obyavi/${l.slug}` },
        ]}
      />
      <div className="container-content grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <span className="badge">{labelFor(LISTING_TYPE_LABELS, l.type)}</span>
          {l.price && (
            <p className="mt-3 text-2xl font-bold tabular-nums text-brand-800">{l.price}</p>
          )}
          {l.description && (
            <div className="mt-4">
              <Prose html={renderMarkdown(l.description)} />
            </div>
          )}
          <DetailActions
            shareTitle={`${l.title} — обява в Бобов дол`}
            shareText={l.price ? `${l.title} — ${l.price}` : l.title}
            sharePath={`/obyavi/${l.slug}`}
          />
        </div>
        <aside className="space-y-4">
          <ContactPanel name={l.contactName} phone={l.contactPhone} email={l.contactEmail} />
          <Notice tone="scam" title="Внимавайте при сделки">
            <p>
              Не превеждайте пари предварително на непознати. „За Бобов дол“ не носи
              отговорност за съдържанието на обявите.
            </p>
          </Notice>
          <ReportContent subject={l.title} path={`/obyavi/${l.slug}`} className="" />
        </aside>
      </div>
    </>
  );
}
