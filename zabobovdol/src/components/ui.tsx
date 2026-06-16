import Link from "next/link";
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
    <div className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-brand-50 via-white to-white">
      {/* Герб като дискретен воден знак */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/bobov-dol-grb.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-4 -top-6 hidden h-44 w-auto opacity-[0.06] sm:block"
        width={140}
        height={200}
      />
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
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-12 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-xl">
        📭
      </div>
      <p className="font-display text-lg font-bold text-slate-800">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
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
