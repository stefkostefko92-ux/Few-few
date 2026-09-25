// browser.test.mjs — общият Chromium launcher (tools/lib/browser.mjs).
// Това е слоят, върху който стоят ТРИ гейта (prelaunch-audit · consent-scan · a11y) — ако той
// мълчи или лъже, и трите са слепи едновременно. Затова: реален launch, не мок.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findChromium, launchChromium } from "./browser.mjs";

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
