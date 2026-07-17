import Link from "next/link";
import { MapPin } from "@/components/icons";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Събития в Бобов дол — какво се случва в града",
  description:
    "Календар на предстоящите събития в Бобов дол: културни прояви, празници, срещи и инициативи.",
  path: "/sabitiya",
});

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("bg-BG", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function EventsPage() {
  const now = new Date();
  const [upcoming, past] = await Promise.all([
    prisma.event.findMany({
      where: { published: true, startAt: { gte: now } },
      orderBy: { startAt: "asc" },
    }),
    prisma.event.findMany({
      where: { published: true, startAt: { lt: now } },
      orderBy: { startAt: "desc" },
      take: 6,
    }),
  ]);

  return (
    <>
      <PageHero
        title="Събития"
        intro="Какво предстои в Бобов дол."
        crumbs={[{ name: "Събития", path: "/sabitiya" }]}
      />
      <div className="container-content py-10">
        <h2 className="mb-4 text-xl font-bold">Предстоящи</h2>
        {upcoming.length === 0 ? (
          <EmptyState title="Няма обявени предстоящи събития." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {upcoming.map((e) => (
              <Link key={e.id} href={`/sabitiya/${e.slug}`} className="card">
                <div className="text-sm font-medium text-brand-700">
                  {fmt(e.startAt)}
                </div>
                <h3 className="mt-1 text-lg font-semibold">{e.title}</h3>
                {e.location && (
                  <div className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {e.location}</div>
                )}
                {e.description && (
                  <p className="mt-2 text-sm text-slate-600">
                    {plainText(e.description, 120)}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}

        {past.length > 0 && (
          <>
            <h2 className="mb-4 mt-10 text-xl font-bold text-slate-600">
              Отминали
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {past.map((e) => (
                <Link
                  key={e.id}
                  href={`/sabitiya/${e.slug}`}
                  className="card opacity-75"
                >
                  <div className="text-sm text-slate-600">{fmt(e.startAt)}</div>
                  <h3 className="mt-1 font-semibold">{e.title}</h3>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
