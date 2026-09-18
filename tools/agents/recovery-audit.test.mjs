// recovery-audit.test.mjs — node:test за стълбата провал→възстановяване (гл.12).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { auditRecovery, REQUIRED_DOCTRINE } from "./recovery-audit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_PROCEDURE = readFileSync(join(ROOT, ".claude", "agents", "_memory", "PROCEDURE.md"), "utf8");
const loop = (o) => ({ loops: [{ id: "l", autonomy: "L1", escalation: "Провал → доклад; нищо не се авто-поправя.", ...o }] });

test("реалната PROCEDURE.md съдържа ЦЯЛАТА стълба (регресия срещу разводняване)", () => {
  const r = auditRecovery(REAL_PROCEDURE, { loops: [] });
  assert.equal(r.doctrineMissing, 0, "липсващи: " + REQUIRED_DOCTRINE.filter((d) => !d.re.test(REAL_PROCEDURE)).map((d) => d.what).join(", "));
});

test("изтрита фаза от доктрината → гейтът пада", () => {
  const gutted = REAL_PROCEDURE.replace(/ВЪЗСТАНОВЯВАНЕ/g, "нещо");
  const r = auditRecovery(gutted, { loops: [] });
  assert.ok(r.errors.some((e) => /възстановяване/i.test(e)));
});

test("махнатата червена линия за необратими действия се хваща", () => {
  const gutted = REAL_PROCEDURE.replace(/не важи за необратими/g, "важи винаги").replace(/необратими действия/g, "действия");
  assert.ok(auditRecovery(gutted, { loops: [] }).errors.some((e) => /необратими/.test(e)));
});

test("loop с празна проза вместо стратегия пада", () => {
  const r = auditRecovery(REAL_PROCEDURE, loop({ escalation: "ще видим какво става" }));
  assert.ok(r.errors.some((e) => /не назовава конкретна стратегия/.test(e)));
});

test("loop с конкретна стратегия минава", () => {
  const r = auditRecovery(REAL_PROCEDURE, loop({ escalation: "Преходен провал → повторен опит; траен → доклад." }));
  assert.equal(r.errors.length, 0);
});

test("L3 без явен спирач пада (безнадзорен loop усилва грешката)", () => {
  const r = auditRecovery(REAL_PROCEDURE, loop({ autonomy: "L3", escalation: "При провал повтаряме опита." }));
  assert.ok(r.errors.some((e) => /изисква ЯВЕН спирач/.test(e)));
});

test("L2 със спирач минава", () => {
  const r = auditRecovery(REAL_PROCEDURE, loop({ autonomy: "L2", escalation: "Провал → откат и спри; човек решава." }));
  assert.equal(r.errors.length, 0);
});

test("реалният loops.json манифест е чист", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "tools", "agents", "loops", "loops.json"), "utf8"));
  assert.equal(auditRecovery(REAL_PROCEDURE, manifest).errors.length, 0);
});
