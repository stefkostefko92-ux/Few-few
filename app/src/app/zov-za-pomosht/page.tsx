import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero, EmptyState } from "@/components/ui";
import { Callout } from "@/components/content";
import { getPublishedHelpCauses } from "@/lib/queries";
import { HelpForm } from "./HelpForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Зов за помощ",
  description:
    "Взаимопомощ за Дупница: потърсете помощ или предложете подкрепа на хора в нужда, особено възрастни.",
  path: "/zov-za-pomosht",
});

export default async function ZovPage() {
  const causes = await getPublishedHelpCauses();
  return (
    <>
      <JsonLd data={webPageLd({ name: "Зов за помощ", path: "/zov-za-pomosht", type: "CollectionPage" })} />
      <PageHero
        eyebrow="Взаимопомощ"
        title="Зов за помощ"
        intro="Когато си помагаме, градът става по-добро място. Потърсете помощ или предложете подкрепа."
        crumbs={[{ name: "Зов за помощ", path: "/zov-za-pomosht" }]}
      />
      <div className="container-content py-10">
        {causes.length === 0 ? (
          <EmptyState title="Все още няма публикувани обяви за помощ" hint="Бъдете първи — попълнете формата по-долу." />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {causes.map((c) => (
              <li key={c.id} className="card">
                <span className="badge">
                  {c.kind === "OFFER" ? "Предлага помощ" : "Търси помощ"}
                </span>
                <h2 className="mt-2 font-display text-lg font-bold text-slate-900">
                  {c.title}
                </h2>
                {c.location && <p className="text-sm text-slate-500">{c.location}</p>}
                <p className="mt-2 text-base text-slate-700">{c.description}</p>
                {(c.contactName || c.contactPhone) && (
                  <p className="mt-2 text-sm text-slate-600">
                    {[c.contactName, c.contactPhone].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-12">
          <h2 className="section-title mb-4">Подайте обява</h2>
          <Callout tone="info">
            Обявите се преглеждат, преди да се публикуват. При спешна опасност за
            здраве и живот се обадете на 112.
          </Callout>
          <HelpForm />
        </div>
      </div>
    </>
  );
}
