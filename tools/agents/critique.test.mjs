// critique.test.mjs — node:test за контура критика → рутинг (гл.16).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { critiqueAgent, memoryDiscipline, critiqueAll } from "./critique.mjs";

const REGISTRY = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "agents-dashboard", "agents.json");

const disc = (verified, quarantine) => ({ verified, quarantine, ratio: (verified + quarantine) ? quarantine / (verified + quarantine) : 0 });

test("memoryDiscipline брои по секции, не сляпо по булети", () => {
  const md = [
    "## Проверени поуки (verified)",
    '- **d:** A _("s"; verified; "https://a.bg/x")_',
    '- **d:** B _("s"; verified; "https://a.bg/y")_',
    "## Карантина (непроверени — НЕ са факт)",
    '- **d:** C _("s"; unverified; "n")_',
  ].join("\n");
  const r = memoryDiscipline(md);
  assert.equal(r.verified, 2);
  assert.equal(r.quarantine, 1);
});

test("два реални сигнала → вдигни модел/усилие", () => {
  const r = critiqueAgent({ id: "x", model: "sonnet", effort: "medium", errors: 1, findings: 1, discipline: disc(100, 0) });
  assert.equal(r.nudge, "escalate");
  assert.equal(r.weight, 2);
});

test("агент вече на таван → hold-max, не безсмислено вдигане", () => {
  const r = critiqueAgent({ id: "x", model: "opus", effort: "high", errors: 3, findings: 0, discipline: disc(100, 0) });
  assert.equal(r.nudge, "hold-max");
  assert.match(r.rationale, /не моделът е лостът/);
});

test("единичен сигнал = задръж (не мърдай рутинга на шум)", () => {
  const r = critiqueAgent({ id: "x", model: "sonnet", effort: "medium", errors: 1, findings: 0, discipline: disc(100, 0) });
  assert.equal(r.nudge, "hold");
  assert.equal(r.weight, 1);
});

test("висока карантина е сигнал само при достатъчно записи (без шум от малка извадка)", () => {
  const many = critiqueAgent({ id: "x", model: "sonnet", effort: "medium", discipline: disc(10, 10) });
  assert.equal(many.weight, 1);
  const few = critiqueAgent({ id: "x", model: "sonnet", effort: "medium", discipline: disc(2, 2) });
  assert.equal(few.weight, 0, "4 поуки не са извадка");
});

test("сваляне иска ПОЛОЖИТЕЛНО доказателство (стаж), не липса на сигнал", () => {
  const green = critiqueAgent({ id: "x", model: "sonnet", effort: "medium", discipline: disc(120, 0) });
  assert.equal(green.nudge, "deescalate-candidate");
  const young = critiqueAgent({ id: "y", model: "sonnet", effort: "medium", discipline: disc(10, 0) });
  assert.equal(young.nudge, "hold");
  assert.match(young.rationale, /рано за сваляне/);
});

test("безопасно-критичен (opus/high) НИКОГА не се предлага за сваляне", () => {
  const r = critiqueAgent({ id: "kasadjiyata", model: "opus", effort: "high", discipline: disc(200, 0) });
  assert.notEqual(r.nudge, "deescalate-candidate");
  assert.match(r.rationale, /по ДОМЕЙН/);
});

test("critiqueAll покрива целия реален флот и дава валидни ръчки", () => {
  const rows = critiqueAll();
  // Твърдението е ПОКРИТИЕ (никой агент не остава без критика), не „флотът е с размер N".
  // Числото 27 стоеше тук закотвено и падна при 28-ия агент, макар нищо да не се беше счупило —
  // тест, който мери снимка вместо инвариант, произвежда фалшива тревога при всяко израстване.
  const roster = new Set(JSON.parse(readFileSync(REGISTRY, "utf8")).agents.map((a) => a.id));
  assert.deepEqual(new Set(rows.map((r) => r.id)), roster, "критиката пропуска агент от регистъра");
  const valid = new Set(["escalate", "hold", "hold-max", "deescalate-candidate"]);
  for (const r of rows) assert.ok(valid.has(r.nudge), `${r.id}: невалидна ръчка ${r.nudge}`);
});
