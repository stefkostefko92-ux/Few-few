import type { Metadata } from "next";
import { MapPin, Phone } from "@/components/icons";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { HELP_KIND_LABELS, labelFor } from "@/lib/categories";
import { PrintButton } from "@/components/PrintButton";

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
      <div className="container-content grid gap-8 py-10 lg:grid-cols-[1fr,18rem]">
        <div>
          <span
            className={
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold " +
              (c.kind === "OFFER" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")
            }
          >
            {labelFor(HELP_KIND_LABELS, c.kind)}
          </span>
          {c.beneficiary && (
            <div className="mt-2 text-sm text-slate-600">За: {c.beneficiary}</div>
          )}
          <div className="mt-4">
            <Prose html={renderMarkdown(c.description)} />
          </div>
          <div className="mt-6 no-print">
            <PrintButton variant="secondary" />
          </div>
        </div>
        <aside>
          <div className="card space-y-3">
            <div className="text-base font-semibold text-slate-900">Контакт</div>
            {c.location && <div className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {c.location}</div>}
            {c.contactName && <div className="text-slate-700">{c.contactName}</div>}
            {c.contactPhone && (
              <a href={`tel:${c.contactPhone}`} className="block text-lg font-semibold text-brand-700">
                <Phone className="inline h-5 w-5 align-text-bottom" aria-hidden /> {c.contactPhone}
              </a>
            )}
            {c.contactEmail && (
              <a href={`mailto:${c.contactEmail}`} className="block break-all text-brand-700 hover:underline">
                {c.contactEmail}
              </a>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Внимавайте с измами. Не превеждайте пари на непознати без проверка.
          </p>
        </aside>
      </div>
    </>
  );
}
