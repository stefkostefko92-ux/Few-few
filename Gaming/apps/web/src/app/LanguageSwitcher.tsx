import { useTranslation } from "react-i18next";
import { LOCALES, type Locale } from "@aso/shared";
import { cn } from "../ui";

const LABELS: Record<Locale, string> = { bg: "БГ", it: "IT", en: "EN" };

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const active = (i18n.resolvedLanguage ?? "bg") as Locale;

  return (
    <div className="inline-flex gap-1 rounded-full border border-brass-400/15 bg-felt-800/60 p-1">
      {LOCALES.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => void i18n.changeLanguage(loc)}
          aria-pressed={loc === active}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-fast",
            loc === active ? "bg-brass-400 text-charcoal-900" : "text-ink-300 hover:text-ink-100",
          )}
        >
          {LABELS[loc]}
        </button>
      ))}
    </div>
  );
}
