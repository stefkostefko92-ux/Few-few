import type { Metadata } from "next";
import { Phone } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { RIDE_KIND_LABELS, labelFor } from "@/lib/categories";

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
  return buildMetadata({
    title: `Споделено пътуване: ${r.routeFrom} – ${r.routeTo}`,
    description: plainText(r.description, 150) || `${r.routeFrom} – ${r.routeTo}`,
    path: `/spodeleno-patuvane/${r.slug}`,
    type: "article",
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

  return (
    <>
      <PageHero
        title={`${r.routeFrom} → ${r.routeTo}`}
        crumbs={[
          { name: "Споделено пътуване", path: "/spodeleno-patuvane" },
          { name: `${r.routeFrom} – ${r.routeTo}`, path: `/spodeleno-patuvane/${r.slug}` },
        ]}
      />
      <div className="container-content grid gap-8 py-10 lg:grid-cols-[1fr,18rem]">
        <div>
          <span
            className={
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold " +
              (r.kind === "OFFER" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")
            }
          >
            {labelFor(RIDE_KIND_LABELS, r.kind)}
          </span>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:max-w-md">
            {r.schedule && (
              <div>
                <dt className="text-slate-400">Кога</dt>
                <dd className="font-medium text-slate-800">{r.schedule}</dd>
              </div>
            )}
            {r.seats && (
              <div>
                <dt className="text-slate-400">Свободни места</dt>
                <dd className="font-medium text-slate-800">{r.seats}</dd>
              </div>
            )}
            {r.costNote && (
              <div>
                <dt className="text-slate-400">Дял от разхода</dt>
                <dd className="font-medium text-slate-800">{r.costNote}</dd>
              </div>
            )}
          </dl>
          {r.description && (
            <div className="mt-4">
              <Prose html={renderMarkdown(r.description)} />
            </div>
          )}
        </div>
        <aside>
          <div className="card space-y-3">
            <div className="text-base font-semibold text-slate-900">Контакт</div>
            {r.contactName && <div className="text-slate-700">{r.contactName}</div>}
            {r.contactPhone && (
              <a href={`tel:${r.contactPhone}`} className="block text-lg font-semibold text-brand-700">
                <Phone className="inline h-5 w-5 align-text-bottom" aria-hidden /> {r.contactPhone}
              </a>
            )}
            {r.contactEmail && (
              <a href={`mailto:${r.contactEmail}`} className="block break-all text-brand-700 hover:underline">
                {r.contactEmail}
              </a>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Уговаряйте се предварително и споделяйте плана с близък. Внимавайте при
            плащания на непознати.
          </p>
        </aside>
      </div>
    </>
  );
}
