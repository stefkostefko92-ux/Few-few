import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, getLegalDoc } from "@/lib/legal";

// Публични правни страници — индексируеми (за реклама/доверие).
export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ doc: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc } = await params;
  const found = getLegalDoc(doc);
  if (!found) return { title: "Документ", robots: { index: false } };
  return {
    title: `${found.title} · Платформа`,
    description: found.intro.slice(0, 155),
    robots: { index: true, follow: true },
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ doc: string }>;
}) {
  const { doc } = await params;
  const found = getLegalDoc(doc);
  if (!found) notFound();

  return (
    <main className="mx-auto max-w-2xl px-5 py-14 sm:py-20">
      <Link href="/legal" className="text-xs text-ink-500 hover:text-ink-300">
        ← Правна информация
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-white">{found.title}</h1>
      <p className="mt-1 text-xs text-ink-500">
        Последна редакция: {found.updated}
      </p>
      <p className="mt-5 text-sm leading-relaxed text-ink-300">{found.intro}</p>

      <div className="mt-8 space-y-6">
        {found.sections.map((s, i) => (
          <section key={i}>
            <h2 className="text-base font-semibold text-white">{s.heading}</h2>
            {s.paragraphs.map((p, j) => (
              <p key={j} className="mt-2 text-sm leading-relaxed text-ink-300">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>

      <p className="mt-10 text-xs text-ink-600">
        Настоящият документ е с общ информационен характер и не представлява
        правен съвет.
      </p>
    </main>
  );
}
