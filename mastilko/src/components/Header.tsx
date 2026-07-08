"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

const TOOLS = [
  { href: "/etiketi", label: "Етикети", emoji: "🏷️" },
  { href: "/vizitki", label: "Визитки", emoji: "💼" },
  { href: "/cv", label: "Автобиография (CV)", emoji: "📄" },
  { href: "/pismo", label: "Мотивационно писмо", emoji: "✉️" },
  { href: "/gramoti", label: "Грамоти и сертификати", emoji: "🏆" },
  { href: "/pokani", label: "Покани и картички", emoji: "🎉" },
  { href: "/tabelki", label: "Табелки и надписи", emoji: "🪧" },
  { href: "/wifi", label: "WiFi стикер", emoji: "📶" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="no-print sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur dark:bg-[#241d19]/85">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <Logo className="h-9 w-9" />
          <span>
            Мастилко
            <span className="ml-2 hidden rounded-full bg-med-pale px-2 py-0.5 text-xs font-semibold text-ink-soft sm:inline dark:bg-white/10">
              безплатно
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-haspopup="true"
              className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-ink-soft transition hover:bg-tera-pale hover:text-tera-dark sm:text-base dark:hover:bg-white/10"
            >
              Инструменти
              <span aria-hidden className={`transition ${open ? "rotate-180" : ""}`}>▾</span>
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
                <nav
                  aria-label="Инструменти"
                  className="card-warm absolute right-0 z-20 mt-2 w-64 overflow-hidden p-2 dark:bg-[#2e2620]"
                >
                  {TOOLS.map((t) => (
                    <Link
                      key={t.href}
                      href={t.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft transition hover:bg-tera-pale hover:text-tera-dark dark:hover:bg-white/10"
                    >
                      <span aria-hidden className="text-lg">{t.emoji}</span>
                      {t.label}
                    </Link>
                  ))}
                </nav>
              </>
            )}
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
