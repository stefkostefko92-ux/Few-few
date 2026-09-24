// memory-capture-inline.test.mjs — поуки като свободни булети не изчезват (2026-09-24).
// Сийдъра предаде проверени поуки като „- дата: текст confidence: verified; source: файл:ред“
// (без `lessons:`/`- text:`) — парсерът намираше нула и ученето тихо изчезваше.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLearn } from "../../.claude/hooks/memory-capture.mjs";

test("свободен булет с полетата в реда (и на следващия ред) се разчита", () => {
  const block = [
    "agent: siydara",
    "- 2026-09-24: check-dups е text-grep без модел-контекст. confidence: verified; source: zabobovdol/prisma/seed-easypay.ts:53",
    "- Banner няма @unique, затова findFirst+update.",
    "  confidence: verified; source: zabobovdol/prisma/schema.prisma:210; scope: zabobovdol",
    "- мнение без увереност",
  ].join("\n");
  const r = parseLearn(block);
  assert.equal(r.agent, "siydara");
  assert.equal(r.lessons.length, 2, "булет без confidence не е поука");
  assert.equal(r.lessons[0].text, "check-dups е text-grep без модел-контекст");
  assert.equal(r.lessons[0].confidence, "verified");
  assert.equal(r.lessons[0].source, "zabobovdol/prisma/seed-easypay.ts:53");
  assert.equal(r.lessons[1].source, "zabobovdol/prisma/schema.prisma:210");
  assert.equal(r.lessons[1].scope, "zabobovdol");
});

test("каноничната схема има приоритет — резервният разчит не се смесва с нея", () => {
  const r = parseLearn("agent: x\nlessons:\n  - text: канонична\n    confidence: verified\n    source: a.js:1\n");
  assert.equal(r.lessons.length, 1);
  assert.equal(r.lessons[0].text, "канонична");
});

test("форматът на файла памет („**дата:** текст _(scope; confidence; source)_“) се разчита", () => {
  const block = [
    "agent: konveyera",
    '- **2026-09-24:** cspos.yml няма `permissions:` блок. _(project; verified; ".github/workflows/cspos.yml (1-15); node tools/ci/workflow-lint.mjs")_',
    "- **2026-09-24:** само мнение без скоби",
  ].join("\n");
  const r = parseLearn(block);
  assert.equal(r.lessons.length, 1);
  assert.equal(r.lessons[0].text, "cspos.yml няма `permissions:` блок.");
  assert.equal(r.lessons[0].scope, "project");
  assert.equal(r.lessons[0].confidence, "verified");
  assert.equal(r.lessons[0].source, ".github/workflows/cspos.yml (1-15); node tools/ci/workflow-lint.mjs");
});
