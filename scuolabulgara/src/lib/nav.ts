import { t, type Dict, type Locale } from "./i18n";
import type { SectionKey } from "./cms";

// Menu entries, each tied to the section it jumps to. A section switched off
// in the admin drops out of the menu instead of leaving a link to nowhere.
const NAV: { id: string; key: SectionKey; label: string }[] = [
  { id: "chi-siamo", key: "about", label: "nav.about" },
  { id: "scuola", key: "school", label: "nav.school" },
  { id: "corsi", key: "courses", label: "nav.courses" },
  { id: "danza", key: "dance", label: "nav.dance" },
  { id: "facebook", key: "facebook", label: "nav.facebook" },
  { id: "contatti", key: "contact", label: "nav.contact" },
];

export function buildNav(locale: Locale, ui: Dict, enabled: (key: string) => boolean) {
  return NAV.filter((n) => enabled(n.key)).map((n) => ({ id: n.id, label: t(locale, n.label, ui) }));
}
