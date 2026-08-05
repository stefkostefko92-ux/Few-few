import assert from "node:assert/strict";
import { test } from "node:test";

import { capabilities, currentMode, isInvestigationMode } from "../mode";

test("по подразбиране режимът е публичен", () => {
  assert.equal(currentMode({}), "public");
  assert.equal(currentMode({ IPLOOKUP_MODE: "" }), "public");
  // Всяка друга стойност също е публична — режимът се включва изрично, не по
  // близост до думата.
  assert.equal(currentMode({ IPLOOKUP_MODE: "police" }), "public");
  assert.equal(currentMode({ IPLOOKUP_MODE: "Investigation" }), "public");
});

test("следственият режим се включва само с точната стойност", () => {
  assert.equal(currentMode({ IPLOOKUP_MODE: "investigation" }), "investigation");
  assert.equal(isInvestigationMode({ IPLOOKUP_MODE: "investigation" }), true);
  assert.equal(isInvestigationMode({}), false);
});

test("публичният режим ползва всички източници и не иска дневник", () => {
  const allowed = capabilities({});
  assert.deepEqual(allowed, {
    liveRegistry: true,
    geofeed: true,
    activeProbe: true,
    caseBrief: false,
    auditRequired: false,
  });
});

test("следственият режим по подразбиране изключва издайническите източници", () => {
  const allowed = capabilities({ IPLOOKUP_MODE: "investigation" });
  // Geofeed заявката отива право на сървъра на оператора на заподозрения, а
  // активната проверка — на самата цел. И двете издават разследването, затова
  // инсталация по подразбиране не бива да ги прави.
  assert.equal(allowed.geofeed, false);
  assert.equal(allowed.activeProbe, false);
  assert.equal(allowed.caseBrief, true);
  assert.equal(allowed.auditRequired, true);
});

test("издайническите източници се отключват само с изричен флаг", () => {
  const withGeofeed = capabilities({ IPLOOKUP_MODE: "investigation", IPLOOKUP_ALLOW_GEOFEED: "1" });
  assert.equal(withGeofeed.geofeed, true);
  assert.equal(withGeofeed.activeProbe, false, "единият флаг не отключва другия");

  const withProbe = capabilities({ IPLOOKUP_MODE: "investigation", IPLOOKUP_ALLOW_PROBE: "1" });
  assert.equal(withProbe.activeProbe, true);
  assert.equal(withProbe.geofeed, false);

  // Стойност, различна от „1", не отключва — иначе „0" или „false" биха
  // включили функцията.
  for (const value of ["0", "false", "да", ""]) {
    assert.equal(
      capabilities({ IPLOOKUP_MODE: "investigation", IPLOOKUP_ALLOW_PROBE: value }).activeProbe,
      false,
      `„${value}" не бива да отключва`,
    );
  }
});

test("флаговете за отключване НЕ важат в публичен режим по погрешка", () => {
  // Публичният режим няма следствена справка, независимо какво е зададено.
  const allowed = capabilities({ IPLOOKUP_ALLOW_PROBE: "1", IPLOOKUP_ALLOW_GEOFEED: "1" });
  assert.equal(allowed.caseBrief, false);
});
