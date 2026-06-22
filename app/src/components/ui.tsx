import Link from "next/link";
import { Inbox } from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbLd } from "@/lib/seo";

export function PageHero({
  title,
  intro,
  crumbs,
  eyebrow,
}: {
  title: string;
  intro?: string;
  crumbs?: { name: string; path: string }[];
  eyebrow?: string;
}) {
  return (
    <div className="page-hero relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-brand-50 via-white to-white">
      <div className="container-content relative py-9 sm:py-11">
        {crumbs && crumbs.length > 0 && (
          <>
            <Breadcrumbs crumbs={[{ name: "Начало", path: "/" }, ...crumbs]} />
            <JsonLd
              data={breadcrumbLd([{ name: "Начало", path: "/" }, ...crumbs])}
            />
          </>
        )}
        {eyebrow && <p className="eyebrow mt-3">{eyebrow}</p>}
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          {title}
        </h1>
        <div className="mt-3 h-1 w-14 rounded-full bg-gold-400" />
        {intro && (
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
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
    <nav aria-label="Навигация по трохи" className="text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((c, i) => (
          <li key={c.path} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>/</span>}
            {i < crumbs.length - 1 ? (
              <Link href={c.path} className="hover:text-brand-700">
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
    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-gradient-to-b from-brand-50/60 to-white p-12 text-center sm:p-16">
      <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-brand-100 text-brand-600 shadow-inner">
        <Inbox className="h-10 w-10" aria-hidden />
      </div>
      <p className="font-display text-xl font-bold text-slate-800">{title}</p>
      {hint && (
        <p className="mx-auto mt-2 max-w-md text-base text-slate-600">{hint}</p>
      )}
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
  children,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="container-content py-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="section-title">{title}</h2>
        {href && (
          <Link
            href={href}
            className="shrink-0 text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
          >
            {hrefLabel} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
