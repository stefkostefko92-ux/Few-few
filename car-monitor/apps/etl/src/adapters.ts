// Адаптери към източниците. По един на източник; сменя се само parser-ът,
// а нататък нормализацията е обща (@car-monitor/ingest).

import type { RawListing, SourceAdapter } from "@car-monitor/ingest";

/**
 * Демонстрационен адаптер с фикстури. В продукция тук стои HTTP scraper/клиент
 * към mobile.bg / cars.bg / OLX, който мапва към RawListing.
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

/** Връща активните адаптери. В продукция филтрира по @car-monitor/config SOURCES. */
export function enabledAdapters(): SourceAdapter[] {
  return [fixturesAdapter];
}
