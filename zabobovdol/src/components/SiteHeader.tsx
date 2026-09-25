"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { SITE, PRIMARY_NAV } from "@/lib/site";
import { SearchBar } from "@/components/SearchBar";
import { Search } from "@/components/icons";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Скрий публичния хедър в админ зоната.
  if (pathname?.startsWith("/admin")) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-300 bg-[#fff]">
      {/* Фонът е `bg-[#fff]`, НЕ `bg-white`: общото тъмно правило
          `html.dark .bg-white` е по-силно от `html.dark header` и потъмняваше
          лентата, която по желание остава светла и в тъмен режим. */}
      <div className="container-content">
        <div className="flex h-[72px] items-center justify-between gap-3">
          {/* Логото е табела: синият емайл с бял кант, като табелата на града. */}
          <Link
            href="/"
            className="sign flex shrink-0 items-center gap-2.5 py-2 pl-2.5 pr-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/bobov-dol-grb.png"
              alt="Герб на Бобов дол"
              width={34}
              height={49}
              className="h-10 w-auto"
            />
            <span className="font-cond text-xl font-bold leading-none sm:text-2xl">
              {SITE.name}
            </span>
          </Link>

          {/* Полето за търсене е едро на началната страница и в /tarsene; тук
              има място само за ясен бутон с надпис, не за смачкано поле. */}
          <Link
            href="/tarsene"
            className="ml-auto hidden min-h-[44px] shrink-0 items-center gap-2 rounded-md border-2 border-brand-800 px-3 py-2 text-base font-semibold text-brand-800 hover:bg-brand-50 lg:inline-flex"
          >
            <Search className="h-5 w-5" aria-hidden />
            Търсене
          </Link>

          <nav className="hidden shrink-0 items-center gap-1 lg:flex" aria-label="Основно меню">
            {PRIMARY_NAV.slice(0, 3).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname?.startsWith(item.href) ? "page" : undefined}
                className="inline-flex min-h-[44px] items-center rounded-md px-3 py-2 text-base font-semibold text-slate-900 hover:bg-brand-50 aria-[current=page]:underline aria-[current=page]:decoration-gold-500 aria-[current=page]:decoration-[3px] aria-[current=page]:underline-offset-8"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/#ukazatel"
              className="inline-flex min-h-[44px] items-center rounded-md px-3 py-2 text-base font-semibold text-slate-900 hover:bg-brand-50"
            >
              Всички раздели
            </Link>
          </nav>

          {/* 112 е винаги пред очите — червената табела е само за спешност. */}
          <a
            href="tel:112"
            className="sign-alert inline-flex min-h-[44px] shrink-0 items-center gap-1.5 px-3.5 py-2 font-cond text-lg font-bold leading-none"
          >
            <span className="hidden sm:inline">Спешност</span> 112
          </a>

          <button
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border-2 border-slate-900 lg:hidden"
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
          <div id="mobile-nav" className="border-t border-slate-300 py-3 lg:hidden">
            <div className="mb-3">
              <SearchBar />
            </div>
            <nav className="grid gap-1" aria-label="Мобилно меню">
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-slate-200 px-1 py-3 text-lg font-semibold text-brand-800 hover:bg-brand-50"
                >
                  {item.label}
                  {item.description && (
                    <span className="block text-base font-normal text-slate-600">
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
