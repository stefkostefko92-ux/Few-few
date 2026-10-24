import type { NextRequest } from "next/server";
import { DEFAULT_LOCALE, localeForCountry, type Locale } from "./i18n";

// Resolve the visitor's country from whatever the upstream proxy provides.
// Works on a self-hosted VPS in several common setups, in priority order:
//   1. nginx with the GeoIP2 module setting `X-Country` (recommended, see DEPLOY.md)
//   2. Cloudflare in front of the origin (`CF-IPCountry`)
//   3. Other CDNs (`X-Geo-Country`, `X-Vercel-IP-Country`, `Fastly-*`)
// Italian unless there is a Bulgarian signal (country or the browser's first
// language); English is never forced — the visitor picks it and it is remembered.
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

/** True when the browser's most preferred language is Bulgarian. */
export function prefersBulgarian(header: string | null): boolean {
  const first = (header || "").split(",")[0]?.split(";")[0].trim().toLowerCase() || "";
  return first.startsWith("bg");
}

// Decide which locale to serve when the visitor lands without an explicit one.
// A Bulgarian browser wins over an Italian IP: a Bulgarian family in Milan.
export function detectLocale(req: NextRequest): Locale {
  if (prefersBulgarian(req.headers.get("accept-language"))) return "bg";
  const country = countryFromHeaders(req.headers);
  return country ? localeForCountry(country) : DEFAULT_LOCALE;
}
