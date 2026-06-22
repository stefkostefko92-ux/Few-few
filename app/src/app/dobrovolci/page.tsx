import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero, EmptyState } from "@/components/ui";
import { Callout } from "@/components/content";
import { getPublishedVolunteers } from "@/lib/queries";
import { VolunteerForm } from "./VolunteerForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Доброволци",
  description:
    "Хора с добро сърце, готови да помогнат на възрастни и нуждаещи се в Дупница. Станете доброволец.",
  path: "/dobrovolci",
});

export default async function DobrovolciPage() {
  const volunteers = await getPublishedVolunteers();
  return (
    <>
      <JsonLd data={webPageLd({ name: "Доброволци", path: "/dobrovolci", type: "CollectionPage" })} />
      <PageHero
        eyebrow="Взаимопомощ"
        title="Доброволци"
        intro="Хора, които предлагат помощ — за пазаруване, придружаване или дребна подкрепа в ежедневието."
        crumbs={[{ name: "Доброволци", path: "/dobrovolci" }]}
      />
      <div className="container-content py-10">
        {volunteers.length === 0 ? (
          <EmptyState title="Все още няма записани доброволци" hint="Запишете се по-долу и ще се свържем с вас." />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {volunteers.map((v) => (
              <li key={v.id} className="card">
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {v.name}
                </h2>
                {v.area && <p className="text-sm text-slate-500">{v.area}</p>}
                {v.skills && (
                  <p className="mt-2 text-base text-slate-700">Помага с: {v.skills}</p>
                )}
                {v.about && <p className="mt-2 text-base text-slate-600">{v.about}</p>}
                <p className="mt-2 text-sm text-slate-500">
                  За връзка пишете ни през „Контакти“ — пазим телефоните лични.
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-12">
          <h2 className="section-title mb-4">Станете доброволец</h2>
          <Callout tone="info">
            Данните за връзка не се показват публично — ползваме ги само за да
            свържем помощта с нуждата.
          </Callout>
          <VolunteerForm />
        </div>
      </div>
    </>
  );
}
