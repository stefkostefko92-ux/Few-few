import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMobileBgDetail, normalizeListing, type NormalizeContext } from "../index.ts";

const html = readFileSync(new URL("./fixtures/mobile-detail.html", import.meta.url), "utf8");

test("parseMobileBgDetail извлича всички ключови полета от реалния DOM", () => {
  const r = parseMobileBgDetail(html);
  assert.equal(r.sourceId, "11780374201029667");
  assert.equal(r.make, "BMW");
  assert.equal(r.model, "M3");
  assert.equal(r.variant, "COMPETITION");
  assert.equal(r.modelYear, 2024);
  assert.equal(r.fuelType, "petrol"); // Бензинов
  assert.equal(r.gearbox, "automatic"); // Автоматична
  assert.equal(r.bodyType, "sedan"); // Седан
  assert.equal(r.powerHp, 530);
  assert.equal(r.engineCc, 2996);
  assert.equal(r.color, "Бял");
  assert.equal(r.euroStandard, "Евро 6");
  assert.equal(r.mileageKm, 51900);
  assert.equal(r.priceAmount, 66999);
  assert.equal(r.priceCurrency, "EUR");
  assert.equal(r.settlement, "София");
  assert.equal(r.sellerKind, "private");
  assert.equal(r.sellerPhone, "0876472224");
  assert.equal(r.editedAt, "2026-06-20");
  assert.equal(r.views, 1309);
  assert.equal(r.photos?.length, 3);
  assert.ok(r.photos?.[0]?.startsWith("https://"));
  assert.match(r.description ?? "", /Frozen white/);
});

test("детайлът се нормализира към графа (без VIN → id по обявата)", () => {
  const ctx: NormalizeContext = {
    eurPerUnit: (c) => (c === "EUR" ? 1 : null),
    modelMedianEur: () => 70000,
    vinActiveElsewhere: () => false,
  };
  const rec = normalizeListing(parseMobileBgDetail(html), ctx);
  assert.equal(rec.vehicle.make, "BMW");
  assert.equal(rec.vehicle.model, "M3");
  assert.equal(rec.vehicle.model_key, "bmw|m3");
  assert.equal(rec.listing.price_eur, 66999);
  assert.ok(rec.vehicle.id.startsWith("v_src_mobile_bg_")); // няма VIN
  assert.equal(rec.vehicle.risk_level, "green");
});
