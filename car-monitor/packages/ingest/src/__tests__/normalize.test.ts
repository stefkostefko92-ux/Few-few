import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeListing, type NormalizeContext, type RawListing } from "../index.ts";

const ctx: NormalizeContext = {
  eurPerUnit: (c) => (c === "BGN" ? 0.511292 : c === "EUR" ? 1 : null),
  modelMedianEur: (mk) => (mk === "vw|golf" ? 12000 : null),
  vinActiveElsewhere: () => false,
};

test("нормализира BGN обява към каноничен EUR", () => {
  const raw: RawListing = {
    sourceId: "1001",
    source: "mobile_bg",
    make: "VW",
    model: "Golf",
    priceAmount: 18583,
    priceCurrency: "BGN",
    mileageKm: 168000,
    listedAt: "2026-06-15",
    vin: "WVWZZZ1KZAW000001",
    sellerName: "Авто София ЕООД",
    sellerEik: "203456789",
  };
  const rec = normalizeListing(raw, ctx);
  assert.equal(rec.listing.price_eur, 9501.34);
  assert.equal(rec.listing.fx_converted, 1);
  assert.equal(rec.vehicle.id, "v_WVWZZZ1KZAW000001");
  assert.equal(rec.seller.id, "s_eik_203456789");
  assert.equal(rec.seller.eik_valid, 1);
});

test("засича върнат пробег и създава събитие + red риск", () => {
  const raw: RawListing = {
    sourceId: "1001",
    source: "mobile_bg",
    make: "VW",
    model: "Golf",
    priceAmount: 9500,
    priceCurrency: "EUR",
    mileageKm: 168000,
    listedAt: "2026-06-15",
    mileageHistory: [{ date: "2023-09-01", km: 210000 }],
  };
  const rec = normalizeListing(raw, ctx);
  assert.equal(rec.vehicle.risk_level, "red");
  assert.equal(rec.vehicle.mileage_flag, "suspect");
  assert.equal(rec.events.length, 1);
  assert.equal(rec.events[0]!.value_delta, -42000);
});

test("чиста кола без VIN ползва source-based id и е green", () => {
  const raw: RawListing = {
    sourceId: "2002",
    source: "cars_bg",
    make: "Toyota",
    model: "RAV4",
    priceAmount: 28500,
    priceCurrency: "EUR",
    mileageKm: 72000,
    listedAt: "2026-06-18",
  };
  const rec = normalizeListing(raw, ctx);
  assert.equal(rec.vehicle.risk_level, "green");
  assert.ok(rec.vehicle.id.startsWith("v_src_cars_bg_"));
});
