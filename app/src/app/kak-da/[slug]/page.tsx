import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildMetadata, webPageLd, howToLd, breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero, Prose } from "@/components/ui";
import { Sources } from "@/components/content";
import { renderMarkdown } from "@/lib/markdown";
import { GUIDES, getGuide, guideSummary } from "@/data/guides";
import { ArrowRight } from "@/components/icons";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return buildMetadata({ title: "Ръководство", path: `/kak-da/${slug}` });
  return buildMetadata({
    title: g.question,
    description: guideSummary(g),
    path: `/kak-da/${g.slug}`,
  });
}

// Парсва "Етикет|url" от relatedLinks към { label, url }.
function parseLink(raw: string): { label: string; url: string } {
  const i = raw.lastIndexOf("|");
  if (i === -1) return { label: raw, url: raw };
  return { label: raw.slice(0, i).trim(), url: raw.slice(i + 1).trim() };
}

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) notFound();

  const summary = guideSummary(g);
  const links = g.relatedLinks.map(parseLink);
  const related = GUIDES.filter(
    (x) => x.category === g.category && x.slug !== g.slug,
  ).slice(0, 6);

  return (
    <>
      <JsonLd
        data={[
          webPageLd({ name: g.question, description: summary, path: `/kak-da/${g.slug}` }),
          ...(g.steps.length
            ? [
                howToLd({
                  name: g.question,
                  description: summary,
                  steps: g.steps,
                  url: `/kak-da/${g.slug}`,
                }),
              ]
            : []),
          breadcrumbLd([
            { name: "Начало", path: "/" },
            { name: "Как да…", path: "/kak-da" },
            { name: g.question, path: `/kak-da/${g.slug}` },
          ]),
        ]}
      />
      <PageHero
        eyebrow={g.category}
        title={g.question}
        crumbs={[
          { name: "Как да…", path: "/kak-da" },
          { name: g.question, path: `/kak-da/${g.slug}` },
        ]}
      />

      <div className="container-content py-10">
        {g.answer && <Prose html={renderMarkdown(g.answer)} />}

        {g.steps.length > 0 && (
          <div className="mt-8">
            <h2 className="section-title mb-4">Стъпка по стъпка</h2>
            <ol className="space-y-4">
              {g.steps.map((step, i) => (
                <li key={i} className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-700 font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="pt-1 text-lg text-slate-700">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {links.length > 0 && (
          <div className="mt-8">
            <h2 className="section-title mb-4">Полезни връзки</h2>
            <Sources items={links} />
          </div>
        )}

        {related.length > 0 && (
          <div className="mt-10 border-t border-slate-200 pt-8">
            <h2 className="section-title mb-4">Вижте също</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/kak-da/${r.slug}`}
                    className="inline-flex items-center gap-1 text-base font-medium text-brand-700 hover:text-brand-800"
                  >
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                    {r.question}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-8">
          <Link href="/kak-da" className="btn-secondary">
            ← Всички ръководства
          </Link>
        </p>
      </div>
    </>
  );
}
