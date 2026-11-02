// memory-core.test.mjs — поука на няколко реда стига до агента цяла (31.10.2026).
// Дефект: memory-preload и извличането взимаха само реда, който започва с „- “ — 54 проверени поуки
// на по няколко реда стигаха до агента без продължението и без източника.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionBlocks, unwrapLessons, sectionLessons, addLessons, bodyKey } from "./memory-core.mjs";

const MD = [
  "# Агент",
  "",
  "## Проверени поуки",
  "- **2026-06-26:** **Режимът зависи от типа сайт.** Reduced-motion дисциплина",
  "  важи за сериозни сайтове, а за арт сайтове — спектакъл",
  "  по подразбиране. _(дизайн на hero ефект; verified; CLAUDE.md:12)_",
  "- **2026-07-01:** еднаредова поука _(sitemap на Next; verified; src/a.ts:1)_",
  "",
  "### Подраздел",
  "- **2026-07-02:** след подзаглавие _(robots.txt; verified; https://a.example)_",
  "",
  "## Карантина",
  "- **2026-07-03:** непроверена на",
  "  два реда _(x y; unverified; —)_",
].join("\n");

test("sectionBlocks: многоредовата поука е ЕДИН запис с продължението и мета-опашката", () => {
  const v = sectionBlocks(MD, "verified");
  assert.equal(v.length, 3);
  assert.match(v[0], /^- \*\*2026-06-26:\*\* .*важи за сериозни сайтове.*по подразбиране\. _\(дизайн на hero ефект; verified; CLAUDE\.md:12\)_$/);
  assert.ok(!v.some((l) => l.includes("### Подраздел")), "подзаглавие не се лепи към поуката");
  assert.equal(sectionBlocks(MD, "quarantine").length, 1);
  assert.match(sectionBlocks(MD, "quarantine")[0], /на два реда _\(x y; unverified/);
});

test("sectionLessons остава ред-по-ред (синхронизацията на клона сравнява редове)", () => {
  assert.equal(sectionLessons(MD, "verified")[0], "- **2026-06-26:** **Режимът зависи от типа сайт.** Reduced-motion дисциплина");
});

test("unwrapLessons: събира поуките на един ред и сменя САМО празното място", () => {
  const { md, joined } = unwrapLessons(MD);
  assert.equal(joined, 2);
  assert.equal(md.replace(/\s+/g, " "), MD.replace(/\s+/g, " "));
  assert.deepEqual(sectionLessons(md, "verified"), sectionBlocks(MD, "verified"));
  assert.ok(md.includes("\n### Подраздел\n"), "подзаглавието остава на мястото си");
  assert.equal(unwrapLessons(md).joined, 0, "идемпотентно");
});

// Регресия 02.11.2026 (Продавача при пресверката на карантината): една и съща поука за linketto
// стоеше ТРИ пъти в Карантина, опровергана на 04.08, 24.10 и 02.11. bodyKey броеше маркера
// „ОПРОВЕРГАНА <дата> (бележка) — “ за част от текста → повторно уловената поука не се разпознаваше
// като вече опровергана и влизаше отново. Опровержението е знание: същата поука не бива да се връща.
test("addLessons: опровергана, дубъл или преместена поука не влиза пак под друга дата", () => {
  const body = "linketto charge.refunded webhook сетва refundedAt БЕЗ значение дали refund-ът е частичен (route.ts:339-346)";
  const tail = " _(linketto webhook; unverified; route.ts:339)_";
  const md = (marker) => `# Продавача\n\n## Проверени поуки\n\n## Карантина\n- **2026-07-10:** ${marker}${body}${tail}\n`;
  const fresh = `- **2026-11-01:** ${body}${tail}`;
  for (const marker of [
    "ОПРОВЕРГАНА 2026-08-04 (поправено: действа само при пълен refund — route.ts:288 (guard)) — ",
    "ОПРОВЕРГАНА 2026-10-24 — ",
    "ДУБЪЛ на 4f13a3cc 2026-11-02 (същото като проверената) — ",
    "ПРЕМЕСТЕНА при kodadjiyata 2026-11-02 — ",
  ]) {
    const r = addLessons(md(marker), { quarantine: [fresh] });
    assert.deepEqual(r.added.quarantine, [], marker);
    assert.equal(bodyKey(`- **2026-07-10:** ${marker}${body}${tail}`), bodyKey(fresh), marker);
  }
});

test("bodyKey: текст, който само ЗАПОЧВА с дума като маркер, не се реже", () => {
  assert.notEqual(bodyKey("- **2026-07-10:** ОПРОВЕРГАНА поука без дата — нещо"), bodyKey("- **2026-07-10:** нещо"));
  assert.notEqual(bodyKey("- **2026-07-10:** ОПРОВЕРГАНА 2026-08-04 (незатворена скоба — нещо"), bodyKey("- **2026-07-10:** нещо"));
});
