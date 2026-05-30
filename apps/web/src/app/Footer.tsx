import { useTranslation } from "react-i18next";
import { BRAND } from "@aso/shared";

/** Mandatory Carbon Stealth attribution (§14) + social-gaming notice (§11.4). */
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mt-auto border-t border-brass-400/10 px-4 py-6 text-center text-xs text-ink-muted">
      <p>{t("footer.notGambling")}</p>
      <p className="mt-1">
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
