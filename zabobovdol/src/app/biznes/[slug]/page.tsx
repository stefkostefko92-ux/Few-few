import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, localBusinessLd } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { BUSINESS_CATEGORY_LABELS, labelFor } from "@/lib/categories";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

async function getBusiness(slug: string) {
  return prisma.business.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBusiness(slug);
  if (!b) return buildMetadata({ title: "Не е намерено", noindex: true });
  return buildMetadata({
    title: b.seoTitle || b.name,
    description:
      b.seoDescription || plainText(b.description, 155) || `${b.name} в Бобов дол.`,
    path: `/biznes/${b.slug}`,
  });
}

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const b = await getBusiness(slug);
  if (!b) notFound();

  return (
    <>
      <JsonLd
        data={localBusinessLd({
          name: b.name,
          description: b.description,
          address: b.address,
          phone: b.phone,
          website: b.website,
          lat: b.lat,
          lng: b.lng,
          hours: b.hours,
        })}
      />
      <PageHero
        title={b.name}
        crumbs={[
          { name: "Местен бизнес", path: "/biznes" },
          { name: b.name, path: `/biznes/${b.slug}` },
        ]}
      />
      <div className="container-content grid gap-8 py-10 lg:grid-cols-[1fr,18rem]">
        <div>
          <div className="badge">
            {labelFor(BUSINESS_CATEGORY_LABELS, b.category)}
          </div>
          {b.description && (
            <div className="mt-4">
              <Prose html={renderMarkdown(b.description)} />
            </div>
          )}
          <div className="mt-6 no-print">
            <PrintButton variant="secondary" />
          </div>
        </div>
        <aside className="space-y-3">
          <div className="card space-y-3">
            {b.phone && (
              <div>
                <div className="text-xs uppercase text-slate-400">Телефон</div>
                <a href={`tel:${b.phone}`} className="text-lg font-semibold text-brand-700">
                  {b.phone}
                </a>
              </div>
            )}
            {b.address && (
              <div>
                <div className="text-xs uppercase text-slate-400">Адрес</div>
                <div className="text-slate-700">{b.address}</div>
              </div>
            )}
            {b.hours && (
              <div>
                <div className="text-xs uppercase text-slate-400">Работно време</div>
                <div className="text-slate-700">{b.hours}</div>
              </div>
            )}
            {b.email && (
              <div>
                <div className="text-xs uppercase text-slate-400">Имейл</div>
                <a href={`mailto:${b.email}`} className="text-brand-700 hover:underline">
                  {b.email}
                </a>
              </div>
            )}
            {b.website && (
              <div>
                <div className="text-xs uppercase text-slate-400">Уебсайт</div>
                <a
                  href={b.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-brand-700 hover:underline"
                >
                  {b.website}
                </a>
              </div>
            )}
            {b.facebook && (
              <div>
                <div className="text-xs uppercase text-slate-400">Facebook</div>
                <a
                  href={b.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-brand-700 hover:underline"
                >
                  Facebook страница
                </a>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
