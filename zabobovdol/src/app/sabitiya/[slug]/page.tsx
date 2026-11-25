import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DetailActions, FactList, PageHero, Prose, safeHttpUrl } from "@/components/ui";
import { CalendarDays, ExternalLink, MapPin, Users } from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, eventLd } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { formatEventWhen, isoDateTime } from "@/lib/format-date";

export const dynamic = "force-dynamic";

async function getEvent(slug: string) {
  return prisma.event.findFirst({ where: { slug, published: true } });
}

// startAt/endAt са стенно софийско време от админ полето (виж lib/format-date.ts).
const WALL = { wall: true } as const;

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
    keywords: [
      e.title,
      "събития Бобов дол",
      "календар Бобов дол",
      e.location ? `${e.location} Бобов дол` : "културни прояви Бобов дол",
      "какво да правя в Бобов дол",
    ],
  });
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = await getEvent(slug);
  if (!e) notFound();
  // „сряда, 29 октомври 2026 г., 18:00–21:00 ч.“ — начало и край в един ред.
  const when = formatEventWhen(e.startAt, e.endAt, WALL);
  const url = safeHttpUrl(e.url);

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
      {/* Една колона: първо „Кога и къде“ (това търси човек), после описанието. */}
      <div className="container-content py-10">
        <div className="max-w-3xl">
          <section aria-labelledby="koga-zaglavie" className="panel">
            <h2 id="koga-zaglavie" className="h-card">
              Кога и къде
            </h2>
            <FactList
              className="mt-3"
              items={[
                {
                  label: "Кога",
                  icon: CalendarDays,
                  value: (
                    <time
                      dateTime={isoDateTime(e.startAt, WALL)}
                      className="font-semibold text-slate-900"
                    >
                      {when}
                    </time>
                  ),
                },
                {
                  label: "Място",
                  icon: MapPin,
                  value: e.location ? (
                    <>
                      {e.location}
                      {e.address && e.address !== e.location && (
                        <span className="block text-slate-700">{e.address}</span>
                      )}
                    </>
                  ) : (
                    e.address
                  ),
                },
                { label: "Организатор", icon: Users, value: e.organizer },
              ]}
            />
            {url && (
              <a
                href={url.toString()}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary no-print mt-4 w-full sm:w-auto"
              >
                <ExternalLink className="h-5 w-5" aria-hidden />
                Повече информация
                <span className="sr-only"> (отваря се в нов раздел)</span>
              </a>
            )}
          </section>
          {e.description && (
            <div className="mt-8">
              <Prose html={renderMarkdown(e.description)} />
            </div>
          )}
          <DetailActions
            shareTitle={`${e.title} — За Бобов дол`}
            shareText={`${e.title} — ${when}`}
            sharePath={`/sabitiya/${e.slug}`}
          />
        </div>
      </div>
    </>
  );
}
