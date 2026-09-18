// consistency-audit.test.mjs — node:test за zero-defect одитора (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLesson, verifiedBullets, auditText } from "./consistency-audit.mjs";

test("parseLesson вади text/scope/conf/source", () => {
  const l = parseLesson('- **2026-07-24:** Курсът е 1.95583. _("евро / курс"; verified; "https://lex.bg/x")_');
  assert.equal(l.conf, "verified");
  assert.equal(l.scope, "евро / курс");
  assert.equal(l.source, "https://lex.bg/x");
  assert.match(l.text, /1\.95583/);
});

test("verifiedBullets взима само от verified раздела, не от Карантина", () => {
  const md = [
    "## Проверени поуки (verified)",
    '- **d:** A _("s"; verified; "https://a.bg/x")_',
    "## Карантина (непроверени — НЕ са факт)",
    '- **d:** B _("s"; unverified; "n")_',
  ].join("\n");
  const b = verifiedBullets(md);
  assert.equal(b.length, 1);
  assert.match(b[0], /A /);
});

test("хваща unresolved_conflict (само-маркирано противоречие) във verified", () => {
  const md = '## Проверени поуки (verified)\n- **d:** X, но противоречи на стар запис — човек да потвърди. _("тема"; verified; "https://a.bg/x")_';
  const f = auditText(md, "kasadjiyata");
  assert.ok(f.some((x) => x.kind === "unresolved_conflict"));
});

test("хваща empty_source (verified с празен източник)", () => {
  const md = '## Проверени поуки (verified)\n- **d:** Нещо си. _("тема"; verified; "")_';
  const f = auditText(md, "x");
  assert.ok(f.some((x) => x.kind === "empty_source"));
});

test("НЕпразен източник НЕ вдига empty_source (форматът е на hook-а)", () => {
  const md = '## Проверени поуки (verified)\n- **d:** Кодов факт. _("код"; verified; "some/file.ts")_';
  assert.equal(auditText(md, "x").filter((x) => x.kind === "empty_source").length, 0);
});

test("факт, който само ОПИСВА разлика, НЕ е противоречие (прецизност)", () => {
  const md = '## Проверени поуки (verified)\n- **d:** xG се разминава 0.05 между доставчици. _("xG"; verified; "https://x.org/y")_';
  assert.equal(auditText(md, "goladjiyata").filter((x) => x.kind === "unresolved_conflict").length, 0);
});

test("явно самомаркирано противоречие СЕ хваща", () => {
  const md = '## Проверени поуки (verified)\n- **d:** Вестници 9% Г, но противоречи на стар запис — човек да потвърди. _("ставки"; verified; "чл.66 ЗДДС")_';
  assert.ok(auditText(md, "kasadjiyata").some((x) => x.kind === "unresolved_conflict"));
});

test("чист verified ред → нула находки", () => {
  const md = '## Проверени поуки (verified)\n- **d:** Просто проверен факт с URL. _("тема"; verified; "https://docs.x.org/y")_';
  assert.equal(auditText(md, "x").length, 0);
});
