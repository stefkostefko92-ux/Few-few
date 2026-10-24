import type { Metadata } from "next";
import { LOCALES, DEFAULT_LOCALE, localeHref, type Locale } from "../i18n/locales";

type Languages = NonNullable<NonNullable<Metadata["alternates"]>["languages"]>;

/** Reciprocal hreflang map for a BG-canonical path (all locales + x-default). */
export function altLanguages(barePath: string): Languages {
  const langs: Record<string, string> = {};
  for (const l of LOCALES) langs[l] = localeHref(l, barePath);
  langs["x-default"] = localeHref(DEFAULT_LOCALE, barePath);
  return langs;
}

/**
 * Meta keywords per locale (repo rule: at least 5, always "Carbon Stealth"). Only games
 * that are in the roster (packages/shared/src/games.ts): "тексас холдем" used to be here,
 * but HOLDEM is retired, so it advertised a game the portal does not have. EN/IT pages
 * used to inherit the Bulgarian list from the root layout.
 */
export const KEYWORDS: Record<Locale, string[]> = {
  bg: ["игри на карти", "белот онлайн", "сантасе", "шах онлайн", "табла", "билярд онлайн", "снукър онлайн", "бридж онлайн", "браузърни игри", "безплатни игри", "Carbon Stealth"],
  en: ["card games", "belote online", "santase online", "chess online", "backgammon online", "pool online", "snooker online", "bridge online", "browser games", "free online games", "Carbon Stealth"],
  it: ["giochi di carte", "belote online", "santase online", "scacchi online", "backgammon online", "biliardo online", "snooker online", "bridge online", "giochi nel browser", "giochi gratis online", "Carbon Stealth"],
};

/** canonical (self) + reciprocal hreflang alternates for a page in `locale`. */
export function alternatesFor(locale: Locale, barePath: string): Metadata["alternates"] {
  return { canonical: localeHref(locale, barePath), languages: altLanguages(barePath) };
}
