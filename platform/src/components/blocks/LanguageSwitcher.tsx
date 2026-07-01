import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { LOCALE_LABEL, LOCALES } from "@/lib/locale";

// Превключвател на езика на публичния сайт. Показва се само когато е включена
// английската версия. Пази текущия път, сменя само ?lang.
export function LanguageSwitcher({
  basePath,
  active,
}: {
  basePath: string;
  active: Locale;
}) {
  return (
    <nav
      aria-label="Език / Language"
      className="flex justify-end gap-1 px-5 pt-4 text-sm"
    >
      {LOCALES.map((loc) => {
        const href = loc === "bg" ? basePath : `${basePath}?lang=en`;
        const isActive = loc === active;
        return (
          <Link
            key={loc}
            href={href}
            hrefLang={loc}
            aria-current={isActive ? "true" : undefined}
            className={`rounded-md px-2.5 py-1 ${
              isActive
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {loc.toUpperCase()}
            <span className="sr-only"> — {LOCALE_LABEL[loc]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
