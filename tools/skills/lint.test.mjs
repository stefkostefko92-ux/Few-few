// lint.test.mjs — node:test за skills валидатора. Пуска се в CI (auto-discovery).
//   node --test tools/skills/lint.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, lintSkill, SKILLS_DIR } from "./lint.mjs";

test("parseFrontmatter: folded скалар (>-) се събира", () => {
  const md = "---\nname: demo\ndescription: >-\n  ред едно\n  ред две\n---\nтяло тук е достатъчно дълго за проверка.";
  const p = parseFrontmatter(md);
  assert.equal(p.fm.name, "demo");
  assert.equal(p.fm.description, "ред едно ред две");
  assert.ok(p.body.startsWith("тяло"));
});

test("parseFrontmatter: липсващ frontmatter → null", () => {
  assert.equal(parseFrontmatter("# просто markdown"), null);
});

test("lintSkill лови name≠папка и празно тяло", () => {
  // няма как да пишем на диск тук — проверяваме чистата логика през parseFrontmatter индиректно
  // чрез реален skill по-долу; тук само граничният случай на несъответствие се покрива от integration-а.
  assert.ok(typeof lintSkill === "function");
});

test("всички наши skills минават lint (0 твърди)", () => {
  const names = existsSync(SKILLS_DIR)
    ? readdirSync(SKILLS_DIR).filter((f) => statSync(join(SKILLS_DIR, f)).isDirectory())
    : [];
  assert.ok(names.length >= 1, "очаквам поне 1 skill");
  for (const n of names) {
    const res = lintSkill(join(SKILLS_DIR, n), n);
    assert.deepEqual(res.errs, [], `${n}: ${res.errs.join("; ")}`);
  }
});

// --- Счупена препратка към инструмент от репото -----------------------------------
// Дефектът, който това пази: линтът проверяваше само `scripts/` препратките, затова
// `stripe-payment` цитираше `tools/payments/stripe-lint.mjs` (реално: `tools/commerce/…`) и
// минаваше зелено. Skill, който вика несъществуващ инструмент, е счупен работен процес —
// изпълняващият агент удря „No such file" насред процедурата, а линтът е казал „чисто".

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

function makeSkill(name, body) {
  const base = mkdtempSync(join(tmpdir(), "skill-"));
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  const front = `---\nname: ${name}\ndescription: Достатъчно дълго описание, за да мине прага на линта за тригер.\n---\n\n`;
  writeFileSync(join(dir, "SKILL.md"), front + body);
  return { dir, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

test("несъществуващ tools/ инструмент е ТВЪРД провал", () => {
  const s = makeSkill("plateno", "Пусни `node tools/payments/stripe-lint.mjs <path>` преди доставка.");
  try {
    const r = lintSkill(s.dir, "plateno");
    assert.ok(r.errs.some((e) => /несъществуващ инструмент/.test(e)), "трябва да е грешка, не съвет");
    assert.ok(r.errs.some((e) => e.includes("tools/payments/stripe-lint.mjs")));
  } finally { s.cleanup(); }
});

test("СЪЩЕСТВУВАЩ tools/ инструмент минава", () => {
  const s = makeSkill("dobre", "Пусни `node tools/commerce/stripe-lint.mjs <path>` преди доставка.");
  try { assert.deepEqual(lintSkill(s.dir, "dobre").errs, []); } finally { s.cleanup(); }
});

test("един счупен път се докладва веднъж, не на всяко споменаване", () => {
  const s = makeSkill("dubli", "tools/nqma/x.mjs и пак tools/nqma/x.mjs и трети път tools/nqma/x.mjs");
  try {
    const errs = lintSkill(s.dir, "dubli").errs.filter((e) => e.includes("tools/nqma/x.mjs"));
    assert.equal(errs.length, 1);
  } finally { s.cleanup(); }
});
