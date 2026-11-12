// bot/src/utils/commandsCatalogL10n/index.js
// Каталогът на командите на езика на човека — за /help в Discord (23.10.2026).
// Речниците и localize.js са копия байт по байт на frontend/src/i18n/commandsCatalog/
// (страницата „Команди“ в таблото) — синхронът се пази от commandsCatalogL10n.test.js.
// В бота се зареждат статично: процесът е един и речниците са малки.
import { COMMAND_CATALOG } from "../commandsCatalog.js";
import { localizeCatalog } from "./localize.js";
import bg from "./bg.js";
import de from "./de.js";
import es from "./es.js";
import fr from "./fr.js";
import it from "./it.js";
import nl from "./nl.js";
import pl from "./pl.js";

export const CATALOG_DICTS = { bg, de, es, fr, it, nl, pl };

// Кодовете на Discord за name_localizations на изборите в /help (es → es-ES).
export const DISCORD_LOCALE = { bg: "bg", de: "de", es: "es-ES", fr: "fr", it: "it", nl: "nl", pl: "pl" };

const cache = new Map();
/** Каталогът на езика `lang` (английски, ако няма речник). Кешира се — каталогът е статичен. */
export function catalogFor(lang) {
  if (!cache.has(lang)) cache.set(lang, localizeCatalog(COMMAND_CATALOG, CATALOG_DICTS[lang] || null));
  return cache.get(lang);
}
