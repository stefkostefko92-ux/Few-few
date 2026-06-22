import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildMetadata, webPageLd, howToLd, breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { Sources } from "@/components/content";
import { HOWTOS } from "@/data/howto";

export function generateStaticParams() {
  return HOWTOS.map((h) => ({ slug: h.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const h = HOWTOS.find((x) => x.slug === slug);
  if (!h) return buildMetadata({ title: "Ръководство", path: `/kak-da/${slug}` });
  return buildMetadata({
    title: h.title,
    description: h.intro,
    path: `/kak-da/${h.slug}`,
  });
}

export default async function HowToDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const h = HOWTOS.find((x) => x.slug === slug);
  if (!h) notFound();

  return (
    <>
      <JsonLd
        data={[
          webPageLd({ name: h.title, description: h.intro, path: `/kak-da/${h.slug}` }),
          howToLd({
            name: h.title,
            description: h.intro,
            steps: h.steps,
            url: `/kak-da/${h.slug}`,
          }),
          breadcrumbLd([
            { name: "Начало", path: "/" },
            { name: "Как да…", path: "/kak-da" },
            { name: h.title, path: `/kak-da/${h.slug}` },
          ]),
        ]}
      />
      <PageHero
        eyebrow={h.category}
        title={h.title}
        intro={h.intro}
        crumbs={[
          { name: "Как да…", path: "/kak-da" },
          { name: h.title, path: `/kak-da/${h.slug}` },
        ]}
      />

      <div className="container-content py-10">
        <ol className="space-y-4">
          {h.steps.map((step, i) => (
            <li key={i} className="flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-700 font-bold text-white">
                {i + 1}
              </span>
              <p className="pt-1 text-lg text-slate-700">{step}</p>
            </li>
          ))}
        </ol>

        {h.links && h.links.length > 0 && (
          <div className="mt-8">
            <h2 className="section-title mb-4">Полезни връзки</h2>
            <ul className="space-y-2">
              {h.links.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Sources items={h.links ?? []} />

        <p className="mt-8">
          <Link href="/kak-da" className="btn-secondary">
            ← Всички ръководства
          </Link>
        </p>
      </div>
    </>
  );
}
