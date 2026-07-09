/**
 * Locale-aware views over the structured content (games + site FAQ). BG fields
 * on the source objects are the canonical text; for EN/IT we overlay the
 * matching translation, falling back to BG when a field is missing. The arrays
 * (howTo / faq) align index-by-index with the source.
 */
import { DEFAULT_LOCALE, type Locale } from "./locales";
import { GAME_CONTENT, type GameContent } from "../content/games";
import { GAME_CONTENT_I18N } from "../content/games.i18n";
import { SITE_FAQ, type SiteFaq } from "../content/faq";
import { SITE_FAQ_I18N } from "../content/faq.i18n";

/** A game with its user-facing strings resolved to `locale`. */
/** Non-default locales — the only ones with translation overlays. */
type TranslatedLocale = Exclude<Locale, "bg">;

export function localizeGame(game: GameContent, locale: Locale): GameContent {
  if (locale === DEFAULT_LOCALE) return game;
  const tr = GAME_CONTENT_I18N[locale as TranslatedLocale]?.[game.key];
  if (!tr) return game;
  return {
    ...game,
    title: tr.title ?? game.title,
    players: tr.players ?? game.players,
    summary: tr.summary ?? game.summary,
    intro: tr.intro ?? game.intro,
    howTo: game.howTo.map((s, i) => tr.howTo[i] ?? s),
    faq: game.faq.map((f, i) => tr.faq[i] ?? f),
  };
}

export function localizedGames(locale: Locale): GameContent[] {
  return GAME_CONTENT.map((g) => localizeGame(g, locale));
}

export function localizedSiteFaq(locale: Locale): SiteFaq[] {
  if (locale === DEFAULT_LOCALE) return SITE_FAQ;
  const tr = SITE_FAQ_I18N[locale as TranslatedLocale];
  if (!tr) return SITE_FAQ;
  return SITE_FAQ.map((f, i) => tr[i] ?? f);
}
