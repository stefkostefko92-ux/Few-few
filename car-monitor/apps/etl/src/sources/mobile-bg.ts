// Адаптер за mobile.bg.
//
// ВАЖНО: селекторите по-долу са best-effort и ТРЯБВА да се сверят срещу
// текущия HTML на сайта преди продукционна употреба (DOM-ът се променя, а
// сайтът има bot защита). Активира се с feature flag SOURCE_MOBILE_BG=1.
//
// Особености на mobile.bg:
//   * Кодировка windows-1251 (не UTF-8) — затова charset е зададен.
//   * Линковете към обявите са относителни — резолюват се спрямо baseUrl.
//   * Цените са в EUR/BGN; валутата се чете от текста (виж priceCurrencyAttr/markup).

import { parseMobileBgList, type SourceAdapter } from "@car-monitor/ingest";
import { httpListingsAdapter, type CommonAdapterOptions } from "./http.ts";

const BASE = "https://www.mobile.bg";

export function mobileBgAdapter(common: CommonAdapterOptions = {}): SourceAdapter {
  return httpListingsAdapter({
    id: "mobile_bg",
    source: "mobile_bg",
    baseUrl: BASE,
    charset: "windows-1251",
    pageUrl: (page) => `${BASE}/obiavi/avtomobili-dzhipove/p-${page}`,
    // Специфичен парсер, сверен срещу реалните карти на mobile.bg
    // (.item > a > .ime/.cena/.km/.grad). За детайлите по обява —
    // parseMobileBgDetail (VIN липсва; id-то на обявата е идентификаторът).
    parse: parseMobileBgList,
    maxPages: common.maxPages,
    delayMs: common.delayMs,
  });
}
