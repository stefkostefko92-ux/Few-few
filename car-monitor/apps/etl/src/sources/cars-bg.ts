// Адаптер за cars.bg.
//
// ВАЖНО: селекторите по-долу са best-effort и ТРЯБВА да се сверят срещу
// текущия HTML на сайта преди продукционна употреба. Активира се с feature
// flag SOURCE_CARS_BG=1.
//
// Особености на cars.bg:
//   * Кодировка UTF-8 (charset не е нужен).
//   * Линковете към обявите са относителни — резолюват се спрямо baseUrl.

import type { SourceAdapter } from "@car-monitor/ingest";
import { httpListingsAdapter, type CommonAdapterOptions } from "./http.ts";

const BASE = "https://www.cars.bg";

export function carsBgAdapter(common: CommonAdapterOptions = {}): SourceAdapter {
  return httpListingsAdapter({
    id: "cars_bg",
    source: "cars_bg",
    baseUrl: BASE,
    pageUrl: (page) => `${BASE}/?subm=1&add_search=1&page=${page}`,
    selectors: {
      // TODO: сверете с реалния DOM на cars.bg.
      item: ".mdc-card, .offer-item",
      idAttr: "data-id",
      title: ".title, a.offer-title",
      link: ".title a, a.offer-title",
      make: ".make",
      model: ".model",
      year: ".year",
      price: ".price",
      priceCurrencyAttr: "data-currency",
      mileage: ".mileage",
      fuel: ".fuel",
      gearbox: ".gearbox",
      location: ".location",
      seller: ".seller",
      sellerKindAttr: "data-kind",
      sellerEikAttr: "data-eik",
    },
    maxPages: common.maxPages,
    delayMs: common.delayMs,
  });
}
