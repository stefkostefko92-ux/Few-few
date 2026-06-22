import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero, EmptyState } from "@/components/ui";
import { Callout } from "@/components/content";
import { getPublishedEvents } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Събития в Дупница",
  description:
    "Културни и обществени събития в Дупница — кога и къде. Афишът се попълва постепенно.",
  path: "/sabitiya",
});

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function SabitiyaPage() {
  const events = await getPublishedEvents();

  return (
    <>
      <JsonLd data={webPageLd({ name: "Събития в Дупница", path: "/sabitiya", type: "CollectionPage" })} />
      <PageHero
        eyebrow="Календар"
        title="Събития"
        intro="Какво се случва в Дупница — концерти, изложби, празници и обществени събития."
        crumbs={[{ name: "Събития", path: "/sabitiya" }]}
      />

      <div className="container-content py-10">
        <Callout tone="info">
          Към момента в Дупница няма единен работещ онлайн афиш — програмата често
          се обявява във Facebook на общината и читалищата. Тук събираме събитията
          постепенно. Знаете за събитие? Пишете ни през „Контакти“.
        </Callout>

        {events.length === 0 ? (
          <EmptyState
            title="Все още няма добавени събития"
            hint="Очаквайте скоро. Междувременно следете официалните страници на общината и читалище „Зора 1858“."
          />
        ) : (
          <ul className="space-y-4">
            {events.map((e) => (
              <li key={e.id} className="card">
                <p className="text-sm font-semibold text-brand-700">
                  {fmtDate(e.startAt)}
                </p>
                <h2 className="mt-1 font-display text-xl font-bold text-slate-900">
                  {e.title}
                </h2>
                {e.location && (
                  <p className="mt-1 text-base text-slate-600">{e.location}</p>
                )}
                {e.description && (
                  <p className="mt-2 text-base text-slate-700">{e.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
