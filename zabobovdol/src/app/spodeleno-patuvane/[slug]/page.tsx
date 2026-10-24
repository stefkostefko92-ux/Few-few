import type { Metadata } from "next";
import { Clock, Coins, ShieldCheck, Users } from "@/components/icons";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ContactPanel, DetailActions, FactList, Notice, PageHero, Prose } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { RIDE_KIND_LABELS, labelFor } from "@/lib/categories";
import { ReportContent } from "@/components/ReportContent";
import { Route, routeText } from "../RouteLabel";

export const dynamic = "force-dynamic";

async function getRide(slug: string) {
  return prisma.rideshare.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = await getRide(slug);
  if (!r) return buildMetadata({ title: "Не е намерено", noindex: true });
  // Без „→“ в <title>: четецът го чете „стрелка надясно“.
  const route = routeText(r.routeFrom, r.routeTo);
  return buildMetadata({
    title: `Споделено пътуване ${route}`,
    description: plainText(r.description, 150) || `Споделено пътуване ${route}.`,
    path: `/spodeleno-patuvane/${r.slug}`,
    type: "article",
    keywords: [
      `${r.routeFrom} ${r.routeTo}`,
      "споделено пътуване Бобов дол",
      `превоз ${r.routeFrom} ${r.routeTo}`,
      "спътници Бобов дол",
      "споделяне на разходи за път",
    ],
  });
}

export default async function RidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const r = await getRide(slug);
  if (!r) notFound();
  // Маршрутът в един формат навсякъде: на екрана „Бобов дол → Дупница“
  // (стрелката скрита за четеца — той чува „до“), в текста — „от … до …“.
  const route = routeText(r.routeFrom, r.routeTo);
  const routeLabel = <Route from={r.routeFrom} to={r.routeTo} />;

  return (
    <>
      <PageHero
        title={routeLabel}
        crumbs={[
          { name: "Споделено пътуване", path: "/spodeleno-patuvane" },
          {
            name: `${r.routeFrom} – ${r.routeTo}`,
            label: routeLabel,
            path: `/spodeleno-patuvane/${r.slug}`,
          },
        ]}
      />
      <div className="container-content grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <span className={r.kind === "OFFER" ? "badge-success" : "badge"}>
            {labelFor(RIDE_KIND_LABELS, r.kind)}
          </span>
          <FactList
            className="mt-4 max-w-md"
            items={[
              { label: "Кога", icon: Clock, value: r.schedule },
              { label: "Свободни места", icon: Users, value: r.seats },
              { label: "Дял от разхода", icon: Coins, value: r.costNote },
            ]}
          />
          {r.description && (
            <div className="mt-6">
              <Prose html={renderMarkdown(r.description)} />
            </div>
          )}
          <DetailActions
            shareTitle={`Споделено пътуване ${route}`}
            shareText={`Споделено пътуване ${route}${r.schedule ? ` — ${r.schedule}` : ""}`}
            sharePath={`/spodeleno-patuvane/${r.slug}`}
          />
        </div>
        <aside className="space-y-4">
          <ContactPanel name={r.contactName} phone={r.contactPhone} email={r.contactEmail} />
          <Notice title="За сигурност" icon={ShieldCheck}>
            <p>
              Уговаряйте се предварително и споделяйте плана с близък. Внимавайте при плащания
              на непознати.
            </p>
          </Notice>
          <ReportContent subject={`Споделено пътуване ${route}`} path={`/spodeleno-patuvane/${r.slug}`} className="" />
        </aside>
      </div>
    </>
  );
}
