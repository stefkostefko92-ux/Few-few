import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, eventLd } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

async function getEvent(slug: string) {
  return prisma.event.findFirst({ where: { slug, published: true } });
}

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("bg-BG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const e = await getEvent(slug);
  if (!e) return buildMetadata({ title: "Не е намерено", noindex: true });
  return buildMetadata({
    title: e.seoTitle || e.title,
    description: e.seoDescription || plainText(e.description, 155),
    path: `/sabitiya/${e.slug}`,
    type: "article",
  });
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const e = await getEvent(slug);
  if (!e) notFound();

  return (
    <>
      <JsonLd
        data={eventLd({
          name: e.title,
          description: e.description,
          startAt: e.startAt,
          endAt: e.endAt,
          location: e.location,
          address: e.address,
          url: e.url,
        })}
      />
      <PageHero
        title={e.title}
        crumbs={[
          { name: "Събития", path: "/sabitiya" },
          { name: e.title, path: `/sabitiya/${e.slug}` },
        ]}
      />
      <div className="container-content grid gap-8 py-10 lg:grid-cols-[1fr,18rem]">
        <div>
          {e.description && <Prose html={renderMarkdown(e.description)} />}
        </div>
        <aside className="space-y-3">
          <div className="card space-y-3">
            <div>
              <div className="text-xs uppercase text-slate-400">Начало</div>
              <div className="font-semibold text-slate-800">{fmt(e.startAt)}</div>
            </div>
            {e.endAt && (
              <div>
                <div className="text-xs uppercase text-slate-400">Край</div>
                <div className="text-slate-700">{fmt(e.endAt)}</div>
              </div>
            )}
            {e.location && (
              <div>
                <div className="text-xs uppercase text-slate-400">Място</div>
                <div className="text-slate-700">{e.location}</div>
              </div>
            )}
            {e.organizer && (
              <div>
                <div className="text-xs uppercase text-slate-400">Организатор</div>
                <div className="text-slate-700">{e.organizer}</div>
              </div>
            )}
            {e.url && (
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary w-full"
              >
                Повече информация
              </a>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
