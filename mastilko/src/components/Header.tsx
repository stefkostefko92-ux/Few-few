"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

const TOOLS = [
  { href: "/etiketi", label: "Етикети", icon: "/icons/etiketi.webp" },
  { href: "/vizitki", label: "Визитки", icon: "/icons/vizitki.webp" },
  { href: "/cv", label: "Автобиография (CV)", icon: "/icons/cv.webp" },
  { href: "/pismo", label: "Мотивационно писмо", icon: "/icons/pismo.webp" },
  { href: "/gramoti", label: "Грамоти и сертификати", icon: "/icons/gramoti.webp" },
  { href: "/pokani", label: "Покани и картички", icon: "/icons/pokani.webp" },
  { href: "/tabelki", label: "Табелки и надписи", icon: "/icons/tabelki.webp" },
  { href: "/wifi", label: "WiFi стикер", icon: "/icons/wifi.webp" },
  { href: "/badzhove", label: "Баджове за събития", icon: "/icons/vizitki.webp" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="no-print sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur dark:bg-[#241d19]/85">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 text-xl font-bold tracking-tight">
          <Logo className="h-9 w-9" decorative />
          <span>
            <span className="wordmark">Мастилко</span>
            <span className="ml-2 hidden rounded-full bg-med-pale px-2 py-0.5 text-xs font-semibold text-ink-soft sm:inline dark:bg-white/10 vivid:bg-[#5bb4e8]/15 vivid:text-[#8fd0f5]">
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
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-ink-soft transition hover:bg-tera-pale hover:text-tera-dark sm:px-4 sm:text-base dark:hover:bg-white/10 vivid:hover:bg-white/10"
            >
              Инструменти
              <span aria-hidden className={`transition ${open ? "rotate-180" : ""}`}>▾</span>
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
                <nav
                  aria-label="Инструменти"
                  className="tools-menu card-warm absolute right-0 z-20 mt-2 w-64 overflow-hidden p-2"
                >
                  {TOOLS.map((t) => (
                    <Link
                      key={t.href}
                      href={t.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft transition hover:bg-tera-pale hover:text-tera-dark dark:hover:bg-white/10"
                    >
                      <Image src={t.icon} alt="" width={36} height={36} unoptimized className="h-8 w-8 shrink-0 object-contain" aria-hidden />
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
