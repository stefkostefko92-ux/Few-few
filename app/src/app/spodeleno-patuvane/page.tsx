import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero, EmptyState } from "@/components/ui";
import { Callout } from "@/components/content";
import { getPublishedRideshares } from "@/lib/queries";
import { RideForm } from "./RideForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Споделено пътуване",
  description:
    "Споделете пътуване от и до Дупница — предложете място в колата или потърсете превоз и споделете разходите.",
  path: "/spodeleno-patuvane",
});

export default async function RidesharePage() {
  const rides = await getPublishedRideshares();
  return (
    <>
      <JsonLd data={webPageLd({ name: "Споделено пътуване", path: "/spodeleno-patuvane", type: "CollectionPage" })} />
      <PageHero
        eyebrow="Придвижване"
        title="Споделено пътуване"
        intro="Пътувате редовно по един маршрут? Споделете колата и разходите — помагате и на себе си, и на съседите."
        crumbs={[{ name: "Споделено пътуване", path: "/spodeleno-patuvane" }]}
      />
      <div className="container-content py-10">
        {rides.length === 0 ? (
          <EmptyState title="Все още няма обяви за споделено пътуване" hint="Бъдете първи — публикувайте обява по-долу." />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {rides.map((r) => (
              <li key={r.id} className="card">
                <span className="badge">
                  {r.kind === "OFFER" ? "Предлага място" : "Търси превоз"}
                </span>
                <h2 className="mt-2 font-display text-lg font-bold text-slate-900">
                  {r.routeFrom} → {r.routeTo}
                </h2>
                <p className="text-sm text-slate-500">
                  {[r.schedule, r.seats && `места: ${r.seats}`, r.costNote]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {r.description && (
                  <p className="mt-2 text-base text-slate-700">{r.description}</p>
                )}
                {(r.contactName || r.contactPhone) && (
                  <p className="mt-2 text-sm text-slate-600">
                    {[r.contactName, r.contactPhone].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-12">
          <h2 className="section-title mb-4">Публикувай обява</h2>
          <Callout tone="info">
            Обявите се преглеждат преди публикуване. Договаряйте се за разходите
            предварително и пътувайте безопасно.
          </Callout>
          <RideForm />
        </div>
      </div>
    </>
  );
}
