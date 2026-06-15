import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, localBusinessLd } from "@/lib/seo";
import { renderMarkdown } from "@/lib/markdown";
import { SERVICE_CATEGORY_LABELS, labelFor } from "@/lib/categories";

export const dynamic = "force-dynamic";

async function getService(slug: string) {
  return prisma.service.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = await getService(slug);
  if (!s) return buildMetadata({ title: "Не е намерено", noindex: true });
  return buildMetadata({
    title: s.seoTitle || `${s.name} — телефон и информация`,
    description:
      s.seoDescription ||
      `${s.name} в Бобов дол. ${s.address ? "Адрес: " + s.address + ". " : ""}${s.phone ? "Телефон: " + s.phone + "." : ""}`,
    path: `/uslugi/${s.slug}`,
  });
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = await getService(slug);
  if (!s) notFound();

  return (
    <>
      <JsonLd
        data={localBusinessLd({
          name: s.name,
          description: s.description,
          address: s.address,
          phone: s.phone,
          website: s.website,
          lat: s.lat,
          lng: s.lng,
          hours: s.hours,
        })}
      />
      <PageHero
        title={s.name}
        crumbs={[
          { name: "Услуги и телефони", path: "/uslugi" },
          { name: s.name, path: `/uslugi/${s.slug}` },
        ]}
      />
      <div className="container-content grid gap-8 py-10 lg:grid-cols-[1fr,18rem]">
        <div>
          <div className="badge">
            {labelFor(SERVICE_CATEGORY_LABELS, s.category)}
          </div>
          {s.description && (
            <div className="mt-4">
              <Prose html={renderMarkdown(s.description)} />
            </div>
          )}
        </div>
        <aside className="space-y-3">
          <div className="card space-y-3">
            {s.phone && (
              <div>
                <div className="text-xs uppercase text-slate-400">Телефон</div>
                <a href={`tel:${s.phone}`} className="text-lg font-semibold text-brand-700">
                  {s.phone}
                </a>
              </div>
            )}
            {s.phone2 && (
              <div>
                <div className="text-xs uppercase text-slate-400">Втори телефон</div>
                <a href={`tel:${s.phone2}`} className="font-semibold text-brand-700">
                  {s.phone2}
                </a>
              </div>
            )}
            {s.address && (
              <div>
                <div className="text-xs uppercase text-slate-400">Адрес</div>
                <div className="text-slate-700">{s.address}</div>
              </div>
            )}
            {s.hours && (
              <div>
                <div className="text-xs uppercase text-slate-400">Работно време</div>
                <div className="text-slate-700">{s.hours}</div>
              </div>
            )}
            {s.email && (
              <div>
                <div className="text-xs uppercase text-slate-400">Имейл</div>
                <a href={`mailto:${s.email}`} className="text-brand-700 hover:underline">
                  {s.email}
                </a>
              </div>
            )}
            {s.website && (
              <div>
                <div className="text-xs uppercase text-slate-400">Уебсайт</div>
                <a
                  href={s.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-brand-700 hover:underline"
                >
                  {s.website}
                </a>
              </div>
            )}
          </div>
          {s.lat && s.lng && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=17/${s.lat}/${s.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full"
            >
              Виж на картата
            </a>
          )}
        </aside>
      </div>
    </>
  );
}
