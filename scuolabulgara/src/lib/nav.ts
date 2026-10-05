import { t, type Dict, type Locale } from "./i18n";
import type { SectionKey } from "./cms";

// Menu entries, each tied to the section it jumps to. They follow the editor's
// section order, and a section switched off in the admin drops out of the menu
// instead of leaving a link to nowhere.
const NAV: Partial<Record<SectionKey, { id: string; label: string }>> = {
  about: { id: "chi-siamo", label: "nav.about" },
  alphabet: { id: "alfabeto", label: "nav.alphabet" },
  school: { id: "scuola", label: "nav.school" },
  courses: { id: "corsi", label: "nav.courses" },
  dance: { id: "danza", label: "nav.dance" },
  contact: { id: "contatti", label: "nav.contact" },
};

export function buildNav(locale: Locale, ui: Dict, sections: readonly SectionKey[]) {
  return sections.flatMap((k) => {
    const n = NAV[k];
    return n ? [{ id: n.id, label: t(locale, n.label, ui) }] : [];
  });
}
