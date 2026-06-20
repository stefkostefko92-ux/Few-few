import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListingsHtml, normalizeListing, type NormalizeContext } from "../index.ts";

const HTML = `
<html><body>
  <div class="listing" data-id="1001">
    <a class="title" href="/obiava/1001">VW Golf 1.6 TDI 2015</a>
    <span class="make">VW</span><span class="model">Golf</span>
    <span class="year">2015</span>
    <span class="price" data-currency="BGN">18 583 лв.</span>
    <span class="mileage">168 000 км</span>
    <span class="fuel">дизел</span>
    <span class="location">София</span>
    <span class="seller" data-kind="dealer" data-eik="203456789">Авто София ЕООД</span>
  </div>
  <div class="listing" data-id="2002">
    <a class="title" href="/obiava/2002">Toyota RAV4 Hybrid 2019</a>
    <span class="make">Toyota</span><span class="model">RAV4</span>
    <span class="year">2019</span>
    <span class="price" data-currency="EUR">28500</span>
    <span class="mileage">72 000 км</span>
    <span class="fuel">хибрид</span>
    <span class="location">Пловдив</span>
    <span class="seller" data-kind="private">Частно лице</span>
  </div>
</body></html>`;

test("parseListingsHtml извлича обявите от HTML", () => {
  const raws = parseListingsHtml(HTML, "mobile_bg");
  assert.equal(raws.length, 2);
  const golf = raws[0]!;
  assert.equal(golf.sourceId, "1001");
  assert.equal(golf.make, "VW");
  assert.equal(golf.model, "Golf");
  assert.equal(golf.modelYear, 2015);
  assert.equal(golf.priceAmount, 18583);
  assert.equal(golf.priceCurrency, "BGN");
  assert.equal(golf.mileageKm, 168000);
  assert.equal(golf.url, "/obiava/1001");
  assert.equal(golf.sellerEik, "203456789");
});

test("парснатите обяви се нормализират към графа", () => {
  const ctx: NormalizeContext = {
    eurPerUnit: (c) => (c === "BGN" ? 0.511292 : c === "EUR" ? 1 : null),
    modelMedianEur: () => null,
    vinActiveElsewhere: () => false,
  };
  const raws = parseListingsHtml(HTML, "mobile_bg");
  const rec = normalizeListing(raws[1]!, ctx);
  assert.equal(rec.vehicle.make, "Toyota");
  assert.equal(rec.listing.price_eur, 28500);
  assert.ok(rec.seller.id.startsWith("s_name_"));
});
