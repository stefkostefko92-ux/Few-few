// backend/src/i18n/index.js
// Tiny i18n helper. Falls back to English if key missing in target language.
import en from "./en.js";
import bg from "./bg.js";
import it from "./it.js";
import de from "./de.js";
import es from "./es.js";
import fr from "./fr.js";
import nl from "./nl.js";
import pl from "./pl.js";

const LOCALES = { en, bg, it, de, es, fr, nl, pl };
export const SUPPORTED_LANGUAGES = Object.keys(LOCALES);

/**
 * Translate a key with optional interpolation.
 *
 *   t("ticket.opened", "bg", { channel: "#support-42" })
 *   → "✅ Билетът ти е създаден: #support-42"
 *
 * Falls back to English if the key is missing in the target locale, and to
 * the key itself as a last resort — so a missing/typo'd key never throws or
 * renders "undefined" in a live message.
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

// ─── Discord locale → our language codes ──────────────────────────────────
// Discord sends the invoking user's client locale on every interaction
// (interaction.locale — https://discord.com/developers/docs/reference#locales).
// Only map the ones we actually support (or have a placeholder for); anything
// else (en-US, en-GB, ja, ko, zh-CN, ...) falls through to the Server.language
// lookup below, then finally "en".
const DISCORD_LOCALE_MAP = {
  bg: "bg",
  de: "de",
  es: "es",
  "es-ES": "es",
  "es-419": "es",
  fr: "fr",
  it: "it",
  nl: "nl",
  pl: "pl",
};

function mapDiscordLocale(discordLocale) {
  if (!discordLocale) return null;
  const direct = DISCORD_LOCALE_MAP[discordLocale];
  if (direct && SUPPORTED_LANGUAGES.includes(direct)) return direct;
  const base = DISCORD_LOCALE_MAP[discordLocale.split("-")[0]];
  return base && SUPPORTED_LANGUAGES.includes(base) ? base : null;
}

/**
 * Synchronous, DB-free locale guess — only looks at `interaction.locale`.
 * Use in hot/sync paths (e.g. friendlyError) where an extra API round-trip
 * would eat into the 3s interaction budget and isn't worth it for an
 * already-degraded (error) response. Falls back to "en".
 */
export function resolveLangSync(interaction) {
  return mapDiscordLocale(interaction?.locale) || "en";
}

// ─── Server.language cache ─────────────────────────────────────────────────
// Same TTL-cache shape as the blacklist cache in events/interactionCreate.js
// (blacklistCache/BLACKLIST_CACHE_TTL) — a synchronous DB hop on every single
// interaction would eat the 3s response budget. Cached per guild; changing
// the language in the dashboard takes up to TTL to be picked up by the bot.
const serverLangCache = new Map(); // guildId → { language, expiresAt }
const SERVER_LANG_CACHE_TTL = 5 * 60 * 1000; // 5 минути

/**
 * Resolve a guild's configured language (Server.language via the backend),
 * TTL-cached. For use in non-interaction contexts (DM form sessions, the
 * guildCreate welcome message) where there's no `interaction.locale` to
 * prefer. Falls back to "en" on any error (backend down, unregistered
 * server, missing/unsupported language) — never throws.
 */
export async function resolveLangForGuild(guildId) {
  if (!guildId) return "en";
  const now = Date.now();
  const cached = serverLangCache.get(guildId);
  if (cached && cached.expiresAt > now) return cached.language;

  let language = "en";
  try {
    const { getServer } = await import("../utils/api.js");
    const server = await getServer(guildId);
    if (server?.language && SUPPORTED_LANGUAGES.includes(server.language)) {
      language = server.language;
    }
  } catch {
    // backend unreachable — fail open to English, don't block the caller
  }

  serverLangCache.set(guildId, { language, expiresAt: now + SERVER_LANG_CACHE_TTL });
  return language;
}

// Периодично почистване, за да не расте Map-ът безкрайно.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of serverLangCache) if (v.expiresAt <= now) serverLangCache.delete(k);
}, SERVER_LANG_CACHE_TTL).unref();

/**
 * Resolve the language to reply in for a given interaction.
 * Priority: interaction.locale (Discord's per-user client locale, mapped to
 * our codes) → Server.language (TTL-cached) → "en".
 *
 *   const lang = await resolveLang(interaction);
 *   await interaction.reply(t("ticket.opened", lang, { channel }));
 */
export async function resolveLang(interaction) {
  const fromLocale = mapDiscordLocale(interaction?.locale);
  if (fromLocale) return fromLocale;
  return resolveLangForGuild(interaction?.guildId);
}
