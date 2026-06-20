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

import type { SourceAdapter } from "@car-monitor/ingest";
import { httpListingsAdapter, type CommonAdapterOptions } from "./http.ts";

const BASE = "https://www.mobile.bg";

export function mobileBgAdapter(common: CommonAdapterOptions = {}): SourceAdapter {
  return httpListingsAdapter({
    id: "mobile_bg",
    source: "mobile_bg",
    baseUrl: BASE,
    charset: "windows-1251",
    pageUrl: (page) => `${BASE}/obiavi/avtomobili-dzhipove/p-${page}`,
    selectors: {
      // TODO: сверете с реалния DOM на mobile.bg.
      item: ".item, .mmm",
      idAttr: "data-id",
      title: "a.title, .text a",
      link: "a.title, .text a",
      make: ".make",
      model: ".model",
      year: ".year, .godina",
      price: ".price, .cena",
      priceCurrencyAttr: "data-currency",
      mileage: ".mileage, .probeg",
      fuel: ".fuel, .gorivo",
      gearbox: ".gearbox, .skorosti",
      location: ".location, .grad",
      seller: ".seller, .dealer",
      sellerKindAttr: "data-kind",
      sellerEikAttr: "data-eik",
    },
    maxPages: common.maxPages,
    delayMs: common.delayMs,
  });
}
