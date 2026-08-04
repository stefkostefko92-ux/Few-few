// memory-freshness.test.mjs — срокът на годност на паметта мери каквото твърди.
//
// Контекст (2026-08-04): 76% от проверените поуки стъпват на външен източник, сверен ВЕДНЪЖ, и само
// 2.8% носят изричен срок. Механизмът се слага ПРЕДИ гниенето — измерено, паметта е от юни–юли 2026
// и нула са просрочени днес. Затова тестовете пазят ЛОГИКАТА (класове, срокове, кой не изтича),
// а не текущия брой просрочени, който по дефиниция ще расте.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classify, collect, summarize, measurementHealth, CLASSES } from "./memory-freshness.mjs";

const mem = (bullets) => {
  const dir = mkdtempSync(join(tmpdir(), "mem-"));
  writeFileSync(join(dir, "test-agent.md"),
    "# Памет\n\n## Проверени поуки (verified)\n" + bullets.join("\n") + "\n\n## Карантина (непроверени — НЕ са факт)\n- нещо\n");
  return dir;
};

test("платформените източници горят най-бързо (отказ от ревю е скъп)", () => {
  for (const host of ["https://developer.apple.com/x", "https://developer.chrome.com/y", "https://docs.stripe.com/z"])
    assert.equal(classify(`- **2026-01-01:** нещо _(x; verified; "${host}")_`).days, 180, host);
});

test("рамки 365, стандарти 730 — текстът на стандарта не мърда като API", () => {
  assert.equal(classify('- x _(a; verified; "https://playwright.dev/docs")_').days, 365);
  assert.equal(classify('- x _(a; verified; "https://www.w3.org/TR/WCAG21/")_').days, 730);
});

test("поука БЕЗ външен източник НЕ изтича (иначе произвеждаме фалшива опашка)", () => {
  // Методология и наш код не гният по календар; репо-пътищата се пазят от deep-audit.
  const c = classify('- **2026-01-01:** тествай поведение, не имплементация _(метод; verified; "CCCR")_');
  assert.equal(c.days, null, "без URL → без срок");
  const items = collect({ dir: mem(['- **2020-01-01:** стара поука без URL _(метод; verified; "CCCR")_']) });
  assert.equal(items[0].due, null, "няма краен срок");
  assert.equal(summarize(items, "2026-08-04").overdue.length, 0, "не бива да влиза в просрочените");
});

test("изричният re-verify ПОБЕЖДАВА класа (човекът знае по-добре)", () => {
  const items = collect({ dir: mem(['- **2026-01-01:** x _(a; verified; "https://developer.apple.com/q"; re-verify: 2030-01-01)_']) });
  assert.equal(items[0].cls, "изричен");
  assert.equal(items[0].due, "2030-01-01", "изричната дата бие 180-те дни на платформата");
  assert.equal(summarize(items, "2026-08-04").overdue.length, 0);
});

test("просрочените се смятат по класа и се подреждат най-спешното първо", () => {
  const items = collect({ dir: mem([
    '- **2026-01-01:** платформа _(a; verified; "https://developer.apple.com/a")_',   // due 2026-06-30
    '- **2026-07-01:** платформа прясна _(a; verified; "https://developer.apple.com/b")_',
    '- **2025-01-01:** стандарт _(a; verified; "https://www.w3.org/TR/x")_',          // due 2027-01-01
  ]) });
  const s = summarize(items, "2026-08-04");
  assert.equal(s.overdue.length, 1, "само старата платформена поука е просрочена");
  assert.match(s.overdue[0].text, /платформа/);
  assert.ok(s.nextDue > "2026-08-04", "следващото изтичане е в бъдещето");
});

test("ГЕЙТЪТ съди измерването, не размера на опашката (иначе го изключват)", () => {
  const dir = mkdtempSync(join(tmpdir(), "snap-"));
  try {
    const snap = join(dir, "s.jsonl"), gi = join(dir, ".gitignore");
    writeFileSync(gi, "node_modules\n");
    // липсва снимка → проблем
    assert.equal(measurementHealth({ file: snap, today: "2026-08-04", gitignorePath: gi }).problems.length, 1);
    // свежа снимка → чисто, ДОРИ да има просрочени (те не се гейтват)
    writeFileSync(snap, JSON.stringify({ month: "2026-08", date: "2026-08-04", total: 10, overdue: 999 }) + "\n");
    assert.deepEqual(measurementHealth({ file: snap, today: "2026-08-04", gitignorePath: gi }).problems, [],
      "999 просрочени не бива да гейтват — да ги намериш е добре");
    // застаряла снимка → проблем (измерването е спряло)
    assert.equal(measurementHealth({ file: snap, today: "2027-01-01", gitignorePath: gi }).problems.length, 1);
    // в .gitignore → амнезия при нов клон
    writeFileSync(gi, "memory-freshness.jsonl\n");
    assert.ok(measurementHealth({ file: snap, today: "2026-08-04", gitignorePath: gi }).problems.some((p) => /gitignore/.test(p)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("реалната памет днес: измерването е живо и класовете покриват всичко", () => {
  const items = collect();
  assert.ok(items.length > 3000, `очаквам хилядите поуки, намерих ${items.length}`);
  assert.deepEqual(measurementHealth().problems, [], "снимката трябва да е записана и свежа");
  assert.ok(CLASSES.every((c) => c.days > 0), "всеки клас носи положителен срок");
});
