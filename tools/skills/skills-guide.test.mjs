// skills-guide.test.mjs — правилата от официалния наръчник на Anthropic, доказани че ПАДАТ.
//
// „The Complete Guide to Building Skills for Claude" (33 стр.) описва изисквания, които дотук
// пазехме по навик, не с проверка. Всяко правило тук е буквално оттам; всяко се доказва с мутация,
// защото правило, за което не е показано, че пада, е декорация.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lintSkill } from "./lint.mjs";
import { audit, loadSkills, stem, toks } from "./trigger-check.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const CORPUS = () => JSON.parse(readFileSync(join(ROOT, "tools", "skills", "triggers.json"), "utf8")).skills;

/** Пясъчник с един валиден skill; `mut` го разваля по един начин. */
function sandbox(name, { file = "SKILL.md", extraFm = "", body = "", readme = false, desc } = {}) {
  const box = mkdtempSync(join(tmpdir(), "skl-"));
  const d = join(box, name);
  mkdirSync(d, { recursive: true });
  const description = desc ?? "Прави нещо конкретно и полезно. Ползвай когато потребителят иска точно това нещо.";
  const md = `---\n${extraFm}name: ${name}\ndescription: >-\n  ${description}\n---\n\n# Заглавие\n\n`
    + (body || "Тяло с достатъчно съдържание, за да мине минималната дължина на проверката.\n");
  writeFileSync(join(d, file), md);
  if (readme) writeFileSync(join(d, "README.md"), "документация");
  const res = lintSkill(d, name);
  rmSync(box, { recursive: true, force: true });
  return res;
}

test("чистото умение минава — иначе всички следващи провали са безсмислени", () => {
  const r = sandbox("chisto-umenie");
  assert.deepEqual(r.errs, [], "валиден skill не бива да пада");
});

test("папката трябва да е kebab-case (наръчник: без главни, интервали, долни черти)", () => {
  for (const bad of ["Ne_Kebab", "NotionSetup", "s-Главна"]) {
    assert.ok(sandbox(bad).errs.length, `„${bad}" трябва да падне`);
  }
});

test("файлът е точно SKILL.md — регистърът е значим при качване", () => {
  const r = sandbox("regis-test", { file: "skill.md" });
  assert.ok(r.errs.some((e) => /регистърът е значим/.test(e)),
    `очаквам диагноза за регистъра, получих: ${r.errs.join(" | ")}`);
});

test("README.md вътре в умението е забранен (документацията е в SKILL.md или references/)", () => {
  assert.ok(sandbox("s-readme", { readme: true }).errs.some((e) => /README/.test(e)));
});

test("префиксите „claude“ и „anthropic“ са РЕЗЕРВИРАНИ", () => {
  for (const bad of ["claude-uchitel", "anthropic-nesto"]) {
    assert.ok(sandbox(bad).errs.some((e) => /РЕЗЕРВИРАН/.test(e)), `„${bad}" трябва да падне`);
  }
  assert.deepEqual(sandbox("uchitel").errs, [], "„uchitel“ е чисто — префиксът не бива да лови по подниз");
});

test("ъглова скоба в СТОЙНОСТ на frontmatter пада; YAML маркерът `>-` НЕ пада", () => {
  const bad = sandbox("uglova", { extraFm: "compatibility: слагай го в <head>\n" });
  assert.ok(bad.errs.some((e) => /ъглова скоба/.test(e)));
  // Реален дефект от писането на това правило: първата версия четеше СУРОВИЯ frontmatter и обяви
  // всичките 21 умения за нарушители, защото `description: >-` съдържа „>". Синтаксис ≠ съдържание.
  const ok = sandbox("chisto-dve");
  assert.ok(readFileSync !== null);
  assert.deepEqual(ok.errs, [], "сгънатият скалар `>-` е валиден YAML, не нарушение");
});

test("описание над 1024 знака пада; дълго ТЯЛО само предупреждава", () => {
  assert.ok(sandbox("dulgo-opis", { desc: "я".repeat(1100) }).errs.some((e) => /1024/.test(e)));
  const dlgo = sandbox("dulgo-tialo", { body: "дума ".repeat(5200) });
  assert.deepEqual(dlgo.errs, [], "прогресивното разкриване е СЪВЕТ, не гейт");
  assert.ok(dlgo.warns.some((w) => /references\//.test(w)), "но трябва да съветва");
});

// ── тригер-корпус ────────────────────────────────────────────────────────────────────────────

test("реалните умения минават гейта за тригери", () => {
  const { fails } = audit(loadSkills(), CORPUS());
  assert.deepEqual(fails, [], `гейтът трябва да е чист: ${fails.map((f) => f.msg).join(" | ")}`);
});

test("умение без тригер-случаи пада (иначе корпусът гние при всяко ново умение)", () => {
  const skills = [...loadSkills(), { name: "novo-umenie", description: "Прави нещо ново и различно от всичко останало." }];
  const { fails } = audit(skills, CORPUS());
  assert.ok(fails.some((f) => f.kind === "непокрито" && f.name === "novo-umenie"));
});

test("сирак в корпуса пада (умението е преименувано/махнато, корпусът е останал)", () => {
  const { fails } = audit(loadSkills(), { ...CORPUS(), "nyama-go": { should: ["а"], shouldNot: ["б"] } });
  assert.ok(fails.some((f) => f.kind === "сирак"));
});

test("описание, СЛЯПО за своя тригер, пада — това е същината на правилото", () => {
  const skills = loadSkills().map((s) =>
    s.name === "indexnow" ? { ...s, description: "Нещо съвсем различно без нито една обща дума." } : s);
  const { fails } = audit(skills, CORPUS());
  assert.ok(fails.some((f) => f.kind === "сляпо описание" && f.name === "indexnow"),
    "смяна на описанието с несвързано трябва да вдигне гейта");
});

test("плитък корпус пада — наръчникът иска очевидна, перифразирана и косвена формулировка", () => {
  const c = CORPUS();
  const { fails } = audit(loadSkills(), { ...c, deploy: { should: ["качи на сървъра"], shouldNot: c.deploy.shouldNot } });
  assert.ok(fails.some((f) => f.kind === "плитко" && f.name === "deploy"));
});

test("нормализацията свързава глаголните форми — иначе гейтът вика вълк по своя дупка", () => {
  // „добави"/„добавяш" са една дума; ако не се свържат, гейтът обвинява изрядно описание.
  assert.equal(stem("добавяш"), stem("добави"));
  assert.equal(stem("страниците"), stem("страница"));
  assert.ok(toks("и на за да се").length === 0, "служебните думи не носят сигнал за разграничаване");
});

test("проверката е в състава на гейта и е задължителна", () => {
  const gate = readFileSync(join(ROOT, "tools", "agents", "gate.mjs"), "utf8");
  assert.match(gate, /trigger-check\.mjs/);
  const rec = gate.slice(gate.indexOf('id: "skill-triggers"'));
  assert.ok(!/required:\s*false/.test(rec.slice(0, rec.indexOf("}"))));
});
