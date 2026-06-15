import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, faqPageLd } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

async function getFaq(slug: string) {
  return prisma.faq.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const faq = await getFaq(slug);
  if (!faq) return buildMetadata({ title: "Не е намерено", noindex: true });
  return buildMetadata({
    title: faq.seoTitle || faq.question,
    description: faq.seoDescription || plainText(faq.answer, 155),
    path: `/kak-da/${faq.slug}`,
    type: "article",
  });
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const faq = await getFaq(slug);
  if (!faq) notFound();

  // Брояч на преглеждания (тихо, без да чупи страницата).
  prisma.faq
    .update({ where: { id: faq.id }, data: { views: { increment: 1 } } })
    .catch(() => {});

  const steps = faq.steps
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const links = faq.relatedLinks
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [label, url] = l.split("|").map((x) => x.trim());
      return { label: label || url, url };
    })
    .filter((l) => l.url);

  return (
    <>
      <JsonLd
        data={faqPageLd([
          { question: faq.question, answerText: plainText(faq.answer, 600) },
        ])}
      />
      <PageHero
        title={faq.question}
        crumbs={[
          { name: "Как да…", path: "/kak-da" },
          { name: faq.question, path: `/kak-da/${faq.slug}` },
        ]}
      />
      <article className="container-content grid gap-8 py-10 lg:grid-cols-[1fr,18rem]">
        <div>
          <Prose html={renderMarkdown(faq.answer)} />

          {steps.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-slate-900">Стъпки</h2>
              <ol className="mt-3 space-y-3">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-700 text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-slate-700">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {links.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-slate-900">Полезни връзки</h2>
              <ul className="mt-3 space-y-2">
                {links.map((l) => (
                  <li key={l.url}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-700 underline hover:text-brand-800"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card bg-brand-50">
            <h2 className="text-base font-semibold text-slate-900">
              Нужна ви е помощ на живо?
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Елате на гишето — ще ви помогнем безплатно и спокойно.
            </p>
            <Link href="/pomosht" className="btn-primary mt-3 w-full">
              Помощ на гише
            </Link>
          </div>
          {faq.tags && (
            <div className="flex flex-wrap gap-2">
              {faq.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((t) => (
                  <span key={t} className="badge">
                    #{t}
                  </span>
                ))}
            </div>
          )}
        </aside>
      </article>
    </>
  );
}
