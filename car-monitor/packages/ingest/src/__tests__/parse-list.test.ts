import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMobileBgList, normalizeListing, type NormalizeContext } from "../index.ts";

const html = readFileSync(new URL("./fixtures/mobile-list.html", import.meta.url), "utf8");

test("parseMobileBgList извлича картите от реалния грид", () => {
  const rows = parseMobileBgList(html);
  assert.equal(rows.length, 3);

  const [a, b, c] = rows;
  // Карта без цена („Попитай").
  assert.equal(a!.sourceId, "11760368108224222");
  assert.equal(a!.make, "BMW");
  assert.equal(a!.model, "M3");
  assert.equal(a!.priceAmount, undefined);
  assert.equal(a!.mileageKm, 16173);
  assert.equal(a!.settlement, "София");
  assert.ok(a!.url?.startsWith("https://www.mobile.bg/obiava-"));
  assert.ok(a!.photos?.[0]?.includes("focus.bg"));
  assert.ok(!a!.photos?.[0]?.includes("/icons/")); // промо-баджът е пропуснат

  // Карта с цена в EUR (+BGN).
  assert.equal(b!.priceAmount, 77000);
  assert.equal(b!.priceCurrency, "EUR");
  assert.equal(b!.mileageKm, 22500);

  // Карта с намалена цена (class DOWN) в друг град.
  assert.equal(c!.priceAmount, 38500);
  assert.equal(c!.settlement, "Пловдив");
});

test("листинг картите се нормализират към графа", () => {
  const ctx: NormalizeContext = {
    eurPerUnit: (cur) => (cur === "EUR" ? 1 : null),
    modelMedianEur: () => 60000,
    vinActiveElsewhere: () => false,
  };
  const rows = parseMobileBgList(html);
  const rec = normalizeListing(rows[1]!, ctx);
  assert.equal(rec.vehicle.model_key, "bmw|m3");
  assert.equal(rec.listing.price_eur, 77000);
  assert.ok(rec.vehicle.id.startsWith("v_src_mobile_bg_")); // няма VIN в листинга
});
