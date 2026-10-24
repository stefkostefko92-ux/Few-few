import type { Metadata } from "next";
import { MapPin, Users } from "@/components/icons";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ContactPanel, DetailActions, FactList, Notice, PageHero, Prose } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { HELP_KIND_LABELS, labelFor } from "@/lib/categories";
import { ReportContent } from "@/components/ReportContent";

export const dynamic = "force-dynamic";

async function getCause(slug: string) {
  return prisma.helpCause.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCause(slug);
  if (!c) return buildMetadata({ title: "Не е намерено", noindex: true });
  return buildMetadata({
    title: c.title,
    description: plainText(c.description, 155),
    path: `/zov-za-pomosht/${c.slug}`,
    type: "article",
    keywords: [
      c.title,
      "зов за помощ Бобов дол",
      "взаимопомощ Бобов дол",
      "помощ за възрастни Бобов дол",
      "дарения Бобов дол",
    ],
  });
}

export default async function CausePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = await getCause(slug);
  if (!c) notFound();

  return (
    <>
      <PageHero
        title={c.title}
        crumbs={[
          { name: "Зов за помощ", path: "/zov-za-pomosht" },
          { name: c.title, path: `/zov-za-pomosht/${c.slug}` },
        ]}
      />
      <div className="container-content grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <span className={c.kind === "OFFER" ? "badge-success" : "badge"}>
            {labelFor(HELP_KIND_LABELS, c.kind)}
          </span>
          <FactList
            className="mt-4 max-w-md"
            items={[
              { label: "За кого", icon: Users, value: c.beneficiary },
              { label: "Място", icon: MapPin, value: c.location },
            ]}
          />
          <div className="mt-6">
            <Prose html={renderMarkdown(c.description)} />
          </div>
          <DetailActions
            shareTitle={`${c.title} — Зов за помощ`}
            sharePath={`/zov-za-pomosht/${c.slug}`}
          />
        </div>
        <aside className="space-y-4">
          <ContactPanel name={c.contactName} phone={c.contactPhone} email={c.contactEmail} />
          <Notice tone="scam" title="Внимавайте с измами">
            <p>Не превеждайте пари на непознати без проверка.</p>
          </Notice>
          <ReportContent subject={c.title} path={`/zov-za-pomosht/${c.slug}`} className="" />
        </aside>
      </div>
    </>
  );
}
