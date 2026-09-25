import Link from "next/link";
import { Inbox } from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbLd } from "@/lib/seo";

export function PageHero({
  title,
  intro,
  crumbs,
}: {
  title: string;
  intro?: string;
  crumbs?: { name: string; path: string }[];
  /** Не се показва: трохите вече казват къде сте (надпис над заглавие е шум). */
  eyebrow?: string;
}) {
  // Тиха лента: смелостта е само в табелите на началната страница. Тук —
  // трохи, едро заглавие и уводен текст, отделени с линия.
  return (
    <div className="page-hero border-b border-slate-300 bg-white">
      <div className="container-content py-8 sm:py-10">
        {crumbs && crumbs.length > 0 && (
          <>
            <Breadcrumbs crumbs={[{ name: "Начало", path: "/" }, ...crumbs]} />
            <JsonLd
              data={breadcrumbLd([{ name: "Начало", path: "/" }, ...crumbs])}
            />
          </>
        )}
        <h1 className="mt-3 max-w-4xl text-4xl text-slate-900 sm:text-5xl">
          {title}
        </h1>
        {intro && (
          <p className="mt-4 max-w-[65ch] text-lg leading-relaxed text-slate-700">
            {intro}
          </p>
        )}
      </div>
    </div>
  );
}

export function Breadcrumbs({
  crumbs,
}: {
  crumbs: { name: string; path: string }[];
}) {
  return (
    <nav aria-label="Навигация по трохи" className="text-sm text-slate-600">
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((c, i) => (
          <li key={c.path} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>/</span>}
            {i < crumbs.length - 1 ? (
              <Link
                href={c.path}
                className="text-brand-800 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-800"
              >
                {c.name}
              </Link>
            ) : (
              <span className="text-slate-700">{c.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-400 bg-white p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <Inbox className="mt-0.5 h-6 w-6 shrink-0 text-slate-500" aria-hidden />
        <div>
          <p className="font-semibold text-slate-800">{title}</p>
          {hint && <p className="mt-1 max-w-md text-base text-slate-600">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

export function Prose({ html }: { html: string }) {
  return (
    <div
      className="prose-content text-slate-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function Section({
  title,
  href,
  hrefLabel = "Виж всички",
  tone = "plain",
  children,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  /** „muted“ слага лента с лек фон през цялата ширина — дава ритъм на дългата
   *  начална страница, за да не е една непрекъсната бяла отсечка. */
  tone?: "plain" | "muted";
  children: React.ReactNode;
}) {
  const inner = (
    <section className="container-content py-10">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {href && (
          <Link href={href} className="more-link">
            {hrefLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  );

  if (tone === "muted") {
    return <div className="border-y border-slate-300 bg-white">{inner}</div>;
  }
  return inner;
}
