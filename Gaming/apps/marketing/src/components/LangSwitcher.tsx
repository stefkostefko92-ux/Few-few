"use client";

import { useI18n } from "../i18n/I18nProvider";
import { LOCALES, LOCALE_LABELS, LOCALE_NAMES } from "../i18n/locales";

/** Header language switcher (BG/EN/IT). Persists the choice via the provider. */
export function LangSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t.langSwitcher.label}
      style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            aria-pressed={active}
            aria-label={LOCALE_NAMES[l]}
            title={LOCALE_NAMES[l]}
            style={{
              cursor: "pointer",
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
          </button>
        );
      })}
    </div>
  );
}
