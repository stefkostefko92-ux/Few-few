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

/** canonical (self) + reciprocal hreflang alternates for a page in `locale`. */
export function alternatesFor(locale: Locale, barePath: string): Metadata["alternates"] {
  return { canonical: localeHref(locale, barePath), languages: altLanguages(barePath) };
}
