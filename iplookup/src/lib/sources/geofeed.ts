import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";

import { CidrSet } from "@/lib/cidr-set";
import { isGloballyRoutable, parseIp, type ParsedIp } from "@/lib/ip";
import { cached } from "./cache";
import type { SourceResult } from "./base";

/**
 * Geofeed (RFC 8805 / RFC 9092) — най-честният геоизточник, който съществува.
 *
 * Всички останали „геолокации“ са предположение на трета страна. Geofeed-ът е
 * CSV файл, който САМИЯТ оператор на мрежата публикува и обявява в регистъра:
 * „ето къде наистина ползвам тези префикси“. Затова, когато го има, той бие
 * всяка платена база — и затова го показваме на първо място.
 *
 * Адресът на файла идва от чужд регистър, тоест е НЕДОВЕРЕН вход. Свалянето му
 * е единственото място в продукта, където URL не е константа, затова минава
 * през изричен предпазител срещу SSRF.
 */

export interface GeofeedEntry {
  prefix: string;
  country?: string;
  region?: string;
  city?: string;
  postalCode?: string;
}

const META = {
  source: "Geofeed на оператора (RFC 8805)",
  sourceUrl: "https://www.rfc-editor.org/rfc/rfc8805.html",
};

const TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Пуска ли се тази заявка изобщо?
 *
 * Изисквания: само HTTPS (RFC 9092 го казва изрично), само порт 443, и всеки
 * адрес, до който името се резолвва, трябва да е публично маршрутизируем.
 * Иначе чужд регистър би могъл да ни накара да ударим вътрешен адрес.
 *
 * Остатъчен риск: DNS може да се промени между проверката и заявката (DNS
 * rebinding). Пълната защита иска свързване по вече проверения адрес; тук
 * приемаме остатъка, защото от файла не се изпълнява нищо и отговорът се
 * връща само като текст.
 */
async function safeUrl(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.port && url.port !== "443") return null;
  if (url.username || url.password) return null;

  try {
    const addresses = await dnsLookup(url.hostname, { all: true });
    if (addresses.length === 0) return null;
    for (const { address } of addresses) {
      const parsed = parseIp(address);
      if (!parsed || !isGloballyRoutable(parsed)) return null;
    }
  } catch {
    return null;
  }
  return url;
}

/** `2001:db8::/32,BG,BG-23,Sofia,1000` — полетата след префикса са незадължителни. */
function parseGeofeed(text: string): { cidr: string; value: GeofeedEntry }[] {
  const entries: { cidr: string; value: GeofeedEntry }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim();
    if (!line) continue;
    const [prefix, country, region, city, postalCode] = line.split(",").map((f) => f.trim());
    if (!prefix || !prefix.includes("/")) continue;
    entries.push({
      cidr: prefix,
      value: {
        prefix,
        country: country?.toUpperCase() || undefined,
        region: region || undefined,
        city: city || undefined,
        postalCode: postalCode || undefined,
      },
    });
    // Един файл може да обявява стотици хиляди префикса — спираме на разумно
    // число, вместо да държим чужд обем в паметта си.
    if (entries.length >= 50_000) break;
  }
  return entries;
}

export async function lookupGeofeed(
  ip: ParsedIp,
  geofeedUrl: string | null,
): Promise<SourceResult<GeofeedEntry>> {
  const started = Date.now();
  const base = { ...META, ms: 0 };

  if (!geofeedUrl) {
    return {
      status: "empty",
      message:
        "Операторът на тази мрежа не е обявил geofeed файл в регистъра. Това е доброволно и повечето мрежи още не го правят.",
      ...base,
    };
  }

  const url = await safeUrl(geofeedUrl);
  if (!url) {
    return {
      status: "error",
      message: "Обявеният geofeed адрес не мина проверката за безопасност и не беше изтеглен.",
      ...base,
    };
  }

  const result = await cached(`geofeed:${url.href}`, TTL_MS, async (signal) => {
    const text = await fetch(url, {
      signal,
      // Никакво следване на пренасочвания: пренасочването би заобиколило
      // проверката, която току-що направихме върху името.
      redirect: "error",
      headers: { "user-agent": "CarbonIP/0.1 (+https://iplookup.carbonstealth.eu)" },
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });
    return parseGeofeed(text);
  });

  if (!result) {
    return { status: "error", message: "Geofeed файлът е недостъпен.", ...META, ms: Date.now() - started };
  }

  const match = new CidrSet(result.value).match(ip.bytes);
  if (!match) {
    return {
      status: "empty",
      message: "Операторът публикува geofeed, но този конкретен адрес не е описан в него.",
      ...META,
      ms: Date.now() - started,
    };
  }

  return { status: "ok", data: match.value, ...META, ms: Date.now() - started };
}
