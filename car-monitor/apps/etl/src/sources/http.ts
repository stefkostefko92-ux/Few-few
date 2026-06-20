// Generic HTTP source адаптер: сваля страници с обяви и ги парсва към RawListing.
// Конкретните източници (mobile.bg, cars.bg) подават URL шаблон и селектори.

import { parseListingsHtml, type ListingSelectors, type RawListing, type SourceAdapter } from "@car-monitor/ingest";

export interface HttpAdapterOptions {
  id: string;
  source: string;
  /** Шаблон за URL на страница; {page} се заменя с номера. */
  pageUrl: (page: number) => string;
  selectors?: ListingSelectors;
  maxPages?: number;
  /** Учтива пауза между заявките (ms). */
  delayMs?: number;
  userAgent?: string;
  /** Кодировка на страницата (напр. "windows-1251" за mobile.bg). По подразбиране utf-8. */
  charset?: string;
  /** Базов адрес за резолюция на относителни линкове. */
  baseUrl?: string;
}

/** Параметри, общи за всички адаптери (от @car-monitor/config). */
export interface CommonAdapterOptions {
  maxPages?: number;
  delayMs?: number;
}

export function httpListingsAdapter(opts: HttpAdapterOptions): SourceAdapter {
  const { id, source, pageUrl, selectors, maxPages = 5, delayMs = 1500, charset, baseUrl } = opts;
  const ua = opts.userAgent ?? "CarMonitorBot/0.1 (+https://car-monitor.example)";

  return {
    id,
    async fetch(): Promise<RawListing[]> {
      const all: RawListing[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const res = await fetch(pageUrl(page), { headers: { "user-agent": ua } });
        if (!res.ok) break;
        const html = await decodeBody(res, charset);
        const batch = parseListingsHtml(html, source, selectors).map((r) => ({
          ...r,
          url: resolveUrl(r.url, baseUrl),
        }));
        if (batch.length === 0) break;
        all.push(...batch);
        if (page < maxPages && delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      return all;
    },
  };
}

/** Декодира тялото с подадена кодировка (за не-UTF-8 сайтове като mobile.bg). */
async function decodeBody(res: Response, charset?: string): Promise<string> {
  if (!charset || /utf-?8/i.test(charset)) return res.text();
  const buf = await res.arrayBuffer();
  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    // Workers runtime може да не поддържа всички кодировки — fallback към utf-8.
    return new TextDecoder().decode(buf);
  }
}

function resolveUrl(href: string | undefined, base?: string): string | undefined {
  if (!href) return undefined;
  if (!base) return href;
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
