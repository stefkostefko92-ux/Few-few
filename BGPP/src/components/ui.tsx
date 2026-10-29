import Link from "next/link";
import type { ReactNode } from "react";
import { External } from "./icons";

// ── Breadcrumbs + Hero ───────────────────────────────────────────────────────
export function PageHero({
  eyebrow,
  title,
  intro,
  crumbs,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  crumbs?: { name: string; path: string }[];
}) {
  return (
    <header className="border-b border-slate-200 bg-gradient-to-b from-brand-50 to-white">
      <div className="container-content py-10 sm:py-14">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Пътека" className="mb-4 text-sm text-slate-500">
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link href="/" className="hover:text-brand-700">
                  Начало
                </Link>
              </li>
              {crumbs.map((c) => (
                <li key={c.path} className="flex items-center gap-1">
                  <span aria-hidden>/</span>
                  <span className="text-slate-700">{c.name}</span>
                </li>
              ))}
            </ol>
          </nav>
        )}
        {eyebrow && (
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-700">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">
          {title}
        </h1>
        {intro && (
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
            {intro}
          </p>
        )}
      </div>
    </header>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────
export function Section({
  title,
  icon,
  children,
  className = "",
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {title && (
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900">
          {icon}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

// ── StatCard ────────────────────────────────────────────────────────────────
export function StatCard({
  value,
  label,
  icon,
}: {
  value: ReactNode;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {icon && <div className="text-brand-700">{icon}</div>}
      <div className="mt-2 text-3xl font-extrabold text-slate-900">{value}</div>
      <div className="text-sm text-slate-600">{label}</div>
    </div>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────────
export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "brand" | "inflow" | "outflow";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    brand: "bg-brand-100 text-brand-800",
    inflow: "bg-inflow-100 text-inflow-800",
    outflow: "bg-outflow-100 text-outflow-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// ── Външна връзка ────────────────────────────────────────────────────────────
export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
    >
      {children}
      <External className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
      <p className="text-lg font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-2 text-slate-500">{hint}</p>}
    </div>
  );
}
