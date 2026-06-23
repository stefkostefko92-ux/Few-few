import { useTranslation } from "react-i18next";
import { BRAND } from "@aso/shared";

// Legal/compliance pages live on the marketing site (root domain); the app is
// served under /app, so absolute root paths resolve to them in production.
const LEGAL_LINKS: { href: string; key: string }[] = [
  { href: "/privacy", key: "footer.privacy" },
  { href: "/terms", key: "footer.terms" },
  { href: "/cookies", key: "footer.cookies" },
  { href: "/responsible", key: "footer.responsible" },
];

/** Mandatory Carbon Stealth attribution (§14) + social-gaming notice (§11.4)
 *  + legal/compliance links (privacy, terms, cookies, responsible gaming). */
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mt-auto border-t border-brass-400/10 px-4 py-6 text-center text-xs text-ink-muted">
      <p>{t("footer.notGambling")}</p>
      <nav aria-label={t("footer.legal")} className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {LEGAL_LINKS.map((l) => (
          <a key={l.href} href={l.href} className="text-ink-300 transition-colors hover:text-brass-300">
            {t(l.key)}
          </a>
        ))}
      </nav>
      <p className="mt-2">
        <a
          href={BRAND.attributionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-300 transition-colors hover:text-brass-300"
        >
          {t("footer.attribution")}
        </a>
      </p>
    </footer>
  );
}
