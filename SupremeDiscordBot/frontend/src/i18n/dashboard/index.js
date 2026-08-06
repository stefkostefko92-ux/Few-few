// frontend/src/i18n/dashboard/index.js
// Обединява всички dashboard locale-и. Английският е канонът и fallback.
import en from "./en.js";
import bg from "./bg.js";
import de from "./de.js";
import es from "./es.js";
import fr from "./fr.js";
import it from "./it.js";
import nl from "./nl.js";
import pl from "./pl.js";

export const DASHBOARD_LOCALES = { en, bg, de, es, fr, it, nl, pl };

// Списъкът за превключвателя — редът е англ. + азбучен по локален етикет.
export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "bg", label: "Български" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
];

export const DEFAULT_LOCALE = "en";
