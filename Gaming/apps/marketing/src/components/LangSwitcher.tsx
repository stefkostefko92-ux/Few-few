"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "../i18n/I18nProvider";
import { LOCALES, LOCALE_LABELS, LOCALE_NAMES, localeHref, stripLocalePrefix, persistLocale } from "../i18n/locales";

/**
 * Header language switcher (BG/EN/IT). Each option is a real <a> to the same
 * page in the target locale — so it doubles as the hreflang navigation crawlers
 * follow — and the choice is persisted (shared with the play app).
 */
export function LangSwitcher() {
  const { locale, t } = useI18n();
  const pathname = usePathname() || "/";
  const bare = stripLocalePrefix(pathname);
  return (
    <div
      role="group"
      aria-label={t.langSwitcher.label}
      style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <Link
            key={l}
            href={localeHref(l, bare)}
            hrefLang={l}
            aria-current={active ? "true" : undefined}
            aria-label={LOCALE_NAMES[l]}
            title={LOCALE_NAMES[l]}
            onClick={() => persistLocale(l)}
            style={{
              display: "inline-block",
              textDecoration: "none",
              padding: "0.2rem 0.45rem",
              fontSize: "0.8rem",
              fontWeight: active ? 700 : 500,
              lineHeight: 1.2,
              borderRadius: "0.35rem",
              border: "1px solid var(--brass-300)",
              background: active ? "var(--brass-300)" : "transparent",
              color: active ? "var(--ink-900, #06150f)" : "var(--brass-300)",
            }}
          >
            {LOCALE_LABELS[l]}
          </Link>
        );
      })}
    </div>
  );
}
