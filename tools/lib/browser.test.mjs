// browser.test.mjs — общият Chromium launcher (tools/lib/browser.mjs).
// Това е слоят, върху който стоят ТРИ гейта (prelaunch-audit · consent-scan · a11y) — ако той
// мълчи или лъже, и трите са слепи едновременно. Затова: реален launch, не мок.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findChromium, launchChromium, pickChromium } from "./browser.mjs";

test("findChromium: несъществуваща база → null, не изключение", () => {
  assert.equal(findChromium("/няма/такава/папка"), null);
});

// Регресия от целия деплой пробег (02.08): `authz-probe.mjs` живее в `FiveM/`, а
// този помощник — в `tools/lib/`. Голото име се резолвва от папката на ФАЙЛА,
// който внася, тоест `FiveM/node_modules` не се поглежда никога и инструментът
// излизаше с „НЕИЗМЕРЕНО" при налична зависимост. Резервният път внася по ФАЙЛОВ
// адрес — и тогава картата `exports` се заобикаля, а именуваните износи изчезват.
test("pickChromium: намира chromium и през `default` (внасяне по файлов адрес)", () => {
  const marker = { launch: () => {} };
  assert.equal(pickChromium({ chromium: marker }), marker, "именуван износ (внасяне по име)");
  assert.equal(
    pickChromium({ default: { chromium: marker } }),
    marker,
    "само `default` — точно формата при внасяне по път; без този клон поправката е нефункционална",
  );
  assert.equal(pickChromium({ default: {} }), null, "липсващ chromium не бива да е undefined-обект");
  assert.equal(pickChromium(null), null, "неуспешен внос не бива да хвърля");
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
