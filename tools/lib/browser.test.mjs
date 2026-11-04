// browser.test.mjs — общият Chromium launcher (tools/lib/browser.mjs).
// Това е слоят, върху който стоят ТРИ гейта (prelaunch-audit · consent-scan · a11y) — ако той
// мълчи или лъже, и трите са слепи едновременно. Затова: реален launch, не мок.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findChromium, launchChromium, loadPkg } from "./browser.mjs";

test("findChromium: несъществуваща база → null, не изключение", () => {
  assert.equal(findChromium("/няма/такава/папка"), null);
});

test("launchChromium: връща { browser } ИЛИ { error } — никога не хвърля, никога не мълчи", async () => {
  const r = await launchChromium();
  assert.ok(r.browser || r.error, "нито браузър, нито обяснение = мълчалив провал");
  if (r.browser) {
    // реален launch — сърцето на трите гейта; версията доказва жив процес, не заглушка
    const v = r.browser.version();
    assert.ok(typeof v === "string" && v.length > 3, `странна версия: ${v}`);
    await r.browser.close();
  } else {
    // среда без браузър е ЛЕГИТИМНА — но обяснението трябва да казва какво липсва
    assert.match(r.error, /playwright|Chromium|chromium/);
  }
});

// Регресия 2026-11-02: ESM import не чете NODE_PATH, а Playwright в средата е глобален → одитите
// казваха „няма playwright“, докато require('playwright') работи. loadPkg пада към require.
test("loadPkg: при неуспешен import пада към require (NODE_PATH), не връща празно", async () => {
  const fake = { chromium: { launch() {} } };
  const mod = await loadPkg("playwright", {
    importer: async () => { throw new Error("ERR_MODULE_NOT_FOUND"); },
    requirer: (n) => { if (n === "playwright") return fake; throw new Error("няма"); },
  });
  assert.equal(mod, fake);
});

test("loadPkg: и двата пътя падат → null (викащият казва ЗАЩО), не изключение", async () => {
  const mod = await loadPkg("няма-такъв-пакет-xyz", {
    importer: async () => { throw new Error("x"); },
    requirer: () => { throw new Error("y"); },
  });
  assert.equal(mod, null);
});
