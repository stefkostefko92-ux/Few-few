// backend/src/i18n/index.js
// Tiny i18n helper. Falls back to English if key missing in target language.
import en from "./en.js";
import bg from "./bg.js";
import it from "./it.js";

const LOCALES = { en, bg, it };
export const SUPPORTED_LANGUAGES = Object.keys(LOCALES);

/**
 * Translate a key with optional interpolation.
 *
 *   t("ticket.opened", "bg", { channel: "#support-42" })
 *   → "✅ Билетът ти е създаден: #support-42"
 *
 * Falls back to English if the key is missing in the target locale.
 * Falls back to the key itself if missing in both.
 */
export function t(key, lang = "en", vars = {}) {
  const locale = LOCALES[lang] || LOCALES.en;
  let str = locale[key] ?? LOCALES.en[key] ?? key;

  // Simple {{varName}} interpolation
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
  }
  return str;
}

/**
 * Returns a bound translator for a specific language — handy in request handlers.
 *
 *   const tr = getTranslator("bg");
 *   tr("ticket.opened", { channel: "#support" })
 */
export function getTranslator(lang) {
  return (key, vars) => t(key, lang, vars);
}

/**
 * Look up a server's configured language from the DB.
 * Falls back to "en" if server not found or language empty.
 */
export async function getServerLanguage(prisma, serverId) {
  try {
    const s = await prisma.server.findUnique({
      where: { id: serverId },
      select: { language: true },
    });
    return s?.language || "en";
  } catch {
    return "en";
  }
}
