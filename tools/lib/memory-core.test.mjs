// memory-core.test.mjs — поука на няколко реда стига до агента цяла (31.10.2026).
// Дефект: memory-preload и извличането взимаха само реда, който започва с „- “ — 54 проверени поуки
// на по няколко реда стигаха до агента без продължението и без източника.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionBlocks, unwrapLessons, sectionLessons } from "./memory-core.mjs";

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
