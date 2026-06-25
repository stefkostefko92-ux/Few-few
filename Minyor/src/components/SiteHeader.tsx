"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { SITE, PRIMARY_NAV } from "@/lib/site";
import { Crest } from "@/components/Crest";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Скрий публичния хедър в админ зоната.
  if (pathname?.startsWith("/admin")) return null;

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="h-1 w-full bg-gradient-to-r from-brand-900 via-gold-400 to-brand-900" />
      <div className="container-content">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 font-bold">
            <Crest className="h-11 w-auto" />
            <span className="text-base leading-tight sm:text-lg">
              {SITE.shortName}
              <span className="block text-xs font-normal text-slate-500">
                Футболен клуб · от {SITE.founded} г.
              </span>
            </span>
          </Link>

          <nav
            className="hidden items-center gap-0.5 xl:flex"
            aria-label="Основно меню"
          >
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={
                  "rounded-md px-2.5 py-2 text-sm font-semibold hover:bg-slate-100 " +
                  (isActive(item.href)
                    ? "text-brand-900 underline decoration-gold-400 decoration-2 underline-offset-4"
                    : "text-slate-700")
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            className="rounded-md border border-slate-300 p-2 xl:hidden"
            aria-label="Меню"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              {open ? (
                <path
                  d="M6 6l12 12M6 18L18 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>

        {open && (
          <div
            id="mobile-nav"
            className="animate-fade-in border-t border-slate-200 py-3 xl:hidden"
          >
            <nav className="grid gap-1" aria-label="Мобилно меню">
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className="rounded-md px-3 py-2.5 text-base font-semibold text-slate-900 hover:bg-slate-100"
                >
                  {item.label}
                  {item.description && (
                    <span className="block text-xs font-normal text-slate-500">
                      {item.description}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
