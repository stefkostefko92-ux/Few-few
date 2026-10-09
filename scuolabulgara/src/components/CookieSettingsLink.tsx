"use client";

import { t, type Locale } from "@/lib/i18n";
import { useUi } from "./UiProvider";

// Footer link that lets the user withdraw/change cookie consent at any time
// (GDPR/ePrivacy: consent must be as easy to withdraw as to give). Clearing the
// stored choice and re-opening the banner is enough — embeds re-check consent.
export default function CookieSettingsLink({ locale }: { locale: Locale }) {
  const ui = useUi();
  const open = () => {
    try {
      localStorage.removeItem("qb-cookie-ack");
      localStorage.removeItem("qb-fb-consent");
      localStorage.removeItem("qb-map-consent");
    } catch {}
    window.dispatchEvent(new Event("qb:cookie-settings"));
  };
  return (
    <li>
      <button type="button" className="linklike" onClick={open}>
        {t(locale, "cookie.manage", ui)}
      </button>
    </li>
  );
}
