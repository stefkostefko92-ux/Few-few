import type { NextRequest } from "next/server";
import { DEFAULT_LOCALE, localeForCountry, type Locale } from "./i18n";

// Resolve the visitor's country from whatever the upstream proxy provides.
// Works on a self-hosted VPS in several common setups, in priority order:
//   1. nginx with the GeoIP2 module setting `X-Country` (recommended, see DEPLOY.md)
//   2. Cloudflare in front of the origin (`CF-IPCountry`)
//   3. Other CDNs (`X-Geo-Country`, `X-Vercel-IP-Country`, `Fastly-*`)
// Falls back to the browser's Accept-Language, then the default locale.
const COUNTRY_HEADERS = [
  "x-country",
  "cf-ipcountry",
  "x-geo-country",
  "x-vercel-ip-country",
  "x-appengine-country",
  "fastly-geo-countrycode",
];

export function countryFromHeaders(headers: Headers): string | null {
  for (const h of COUNTRY_HEADERS) {
    const v = headers.get(h);
    if (v && v.length === 2 && v.toUpperCase() !== "XX") return v.toUpperCase();
  }
  return null;
}

function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const langs = header
    .split(",")
    .map((p) => p.split(";")[0].trim().toLowerCase())
    .filter(Boolean);
  for (const l of langs) {
    if (l.startsWith("it")) return "it";
    if (l.startsWith("bg")) return "bg";
    if (l.startsWith("en")) return "en";
  }
  return null;
}

// Decide which locale to serve when the visitor lands without an explicit one.
export function detectLocale(req: NextRequest): Locale {
  const country = countryFromHeaders(req.headers);
  if (country) return localeForCountry(country);
  const fromLang = localeFromAcceptLanguage(req.headers.get("accept-language"));
  if (fromLang) return fromLang;
  return DEFAULT_LOCALE;
}
