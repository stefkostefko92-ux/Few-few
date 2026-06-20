// Адаптери към източниците. По един на източник; сменя се само parser-ът,
// а нататък нормализацията е обща (@car-monitor/ingest).

import {
  parseListingsHtml,
  type ListingSelectors,
  type RawListing,
  type SourceAdapter,
} from "@car-monitor/ingest";

/**
 * Демонстрационен адаптер с фикстури. Полезен за `pnpm dev` без мрежа.
 */
export const fixturesAdapter: SourceAdapter = {
  id: "fixtures",
  async fetch(): Promise<RawListing[]> {
    return [
      {
        sourceId: "1001",
        source: "mobile_bg",
        title: "VW Golf 1.6 TDI 2015",
        url: "https://example/1001",
        make: "VW",
        model: "Golf",
        modelYear: 2015,
        vin: "WVWZZZ1KZAW000001",
        fuelType: "diesel",
        gearbox: "manual",
        bodyType: "hatch",
        powerHp: 105,
        mileageKm: 168000,
        priceAmount: 18583,
        priceCurrency: "BGN",
        settlement: "София",
        locationNuts: "BG411",
        listedAt: "2026-06-15",
        sellerName: "Авто София ЕООД",
        sellerKind: "dealer",
        sellerEik: "203456789",
        mileageHistory: [{ date: "2023-09-01", km: 210000 }],
      },
      {
        sourceId: "2002",
        source: "cars_bg",
        title: "Toyota RAV4 Hybrid 2019",
        url: "https://example/2002",
        make: "Toyota",
        model: "RAV4",
        modelYear: 2019,
        vin: "JTMBFREVXJD000002",
        fuelType: "hybrid",
        gearbox: "automatic",
        bodyType: "suv",
        powerHp: 218,
        mileageKm: 72000,
        priceAmount: 28500,
        priceCurrency: "EUR",
        settlement: "Пловдив",
        locationNuts: "BG421",
        listedAt: "2026-06-18",
        sellerName: "Частно лице",
        sellerKind: "private",
      },
    ];
  },
};

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
}

/**
 * Generic HTTP адаптер: сваля страници с обяви и ги парсва към RawListing.
 * Спира при празна страница или достигнат maxPages. Реалните селектори за
 * конкретния сайт се подават през `selectors`.
 */
export function httpListingsAdapter(opts: HttpAdapterOptions): SourceAdapter {
  const { id, source, pageUrl, selectors, maxPages = 5, delayMs = 1000 } = opts;
  const ua = opts.userAgent ?? "CarMonitorBot/0.1 (+https://car-monitor.example)";

  return {
    id,
    async fetch(): Promise<RawListing[]> {
      const all: RawListing[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const res = await fetch(pageUrl(page), { headers: { "user-agent": ua } });
        if (!res.ok) break;
        const html = await res.text();
        const batch = parseListingsHtml(html, source, selectors);
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

/**
 * Връща активните адаптери. По подразбиране фикстури (за dev). За продукция
 * заменете с httpListingsAdapter с реалните URL-и и селектори на източника,
 * напр.:
 *
 *   httpListingsAdapter({
 *     id: "mobile_bg", source: "mobile_bg",
 *     pageUrl: (p) => `https://www.mobile.bg/obiavi/avtomobili?p=${p}`,
 *     selectors: { item: ".item", title: ".title", price: ".price", ... },
 *   })
 */
export function enabledAdapters(): SourceAdapter[] {
  return [fixturesAdapter];
}
