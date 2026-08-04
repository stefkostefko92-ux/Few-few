import Link from "next/link";

import ThemeToggle from "./ThemeToggle";
import { SITE_NAME } from "@/lib/site";

export default function Header() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 font-semibold text-text">
          <Mark />
          <span>{SITE_NAME}</span>
        </Link>
        <nav className="flex items-center gap-2" aria-label="Основна навигация">
          <Link href="/kak-raboti" className="btn-ghost hidden px-3 py-2 text-sm sm:inline-flex">
            Как работи
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

/**
 * Знакът: шестоъгълна карбонова клетка с лаймово ядро. Вграден SVG — нула
 * заявки, наследява цвета на темата и остава остър при всяка разделителна
 * способност.
 */
function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M16 2.5 27.5 9v14L16 29.5 4.5 23V9z"
        fill="none"
        stroke="var(--c-border-strong)"
        strokeWidth="1.6"
      />
      <path
        d="M16 8.5 22.5 12v8L16 23.5 9.5 20v-8z"
        fill="none"
        stroke="var(--c-accent)"
        strokeWidth="1.6"
      />
      <circle cx="16" cy="16" r="3" fill="var(--c-accent-strong)" />
    </svg>
  );
}
