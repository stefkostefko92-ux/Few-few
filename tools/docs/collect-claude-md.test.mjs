// collect-claude-md.test.mjs — docs.js (таблото) отразява реалните CLAUDE.md.
//
// Реален дефект (2026-08-04): docs.js беше замразен на 2026-07-28, а root CLAUDE.md порасна
// 15697→26282b — таблото показваше документ ~40% по-къс от реалния. Проверката СЪЩЕСТВУВАШЕ
// (--check), но: (1) не се викаше от нито един гейт/CI → дрейфът беше невидим; (2) беше ДАТА-
// ЧУВСТВИТЕЛНА (сравняваше цял body с вградена дата) → щеше да е червена ВСЕКИ ден, затова не
// можеше да се гейтне. Тук пазим и двете: --check е дата-нечувствителна и е в gate.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOOL = join(ROOT, "tools/docs/collect-claude-md.mjs");
const OUT = join(ROOT, "agents-dashboard/docs.js");
const run = (env = {}) => spawnSync(process.execPath, [TOOL, "--check"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });

test("--check е ЗЕЛЕН днес (docs.js отразява реалните CLAUDE.md)", () => {
  assert.equal(run().status, 0, "docs.js трябва да е свеж — пусни: node tools/docs/collect-claude-md.mjs");
});

test("--check е ДАТА-НЕЧУВСТВИТЕЛНА (различна дата НЕ пали фалшив дрейф)", () => {
  // Дори с бъдеща GENERATED_DATE проверката трябва да мине — иначе gate-ът е червен всеки ден.
  assert.equal(run({ GENERATED_DATE: "2099-12-31" }).status, 0, "само датата не бива да пали дрейф");
});

test("--check е РЕД-НЕЧУВСТВИТЕЛНА (CI провалът 2026-08-04: друга ICU колация → друг ред)", () => {
  // Реален CI провал: гейтът беше зелен локално (Node 22.22) и червен в CI (Node 22.23) БЕЗ нито
  // един байт разлика в съдържанието — разликата беше само РЕДЪТ, защото генераторът подреждаше с
  // `localeCompare` (зависи от локал/ICU). Тук: разбъркан ред със същото съдържание → пак зелено.
  const original = readFileSync(OUT, "utf8");
  const d = JSON.parse(original.match(/window\.__DOCS__ = ([\s\S]*?);\nvar docs/)[1]);
  d.files = [...d.files].reverse();
  const banner = "// АВТО-ГЕНЕРИРАН от tools/docs/collect-claude-md.mjs — не редактирай ръчно.\n";
  writeFileSync(OUT, banner + "window.__DOCS__ = " + JSON.stringify(d, null, 2) + ";\nvar docs = window.__DOCS__;\n");
  try {
    assert.equal(run().status, 0, "различен РЕД при същото съдържание НЕ бива да пали гейта");
  } finally {
    writeFileSync(OUT, original);
    assert.equal(readFileSync(OUT, "utf8"), original, "възстановяването се провали");
  }
});

test("генераторът НЕ ползва localeCompare (артефакт за байтово сравнение иска локал-независим ред)", () => {
  const src = readFileSync(TOOL, "utf8");
  const code = src.replace(/^\s*\/\/.*$/gm, ""); // махни коментарите — там думата се СПОМЕНАВА
  assert.ok(!/localeCompare/.test(code),
    "localeCompare зависи от локал/ICU → редът се разминава между машини (реалният CI провал)");
});

test("--check ХВАЩА реален дрейф на съдържанието (byte-verify restore)", () => {
  const original = readFileSync(OUT, "utf8");
  // подмени съдържанието на един файл в payload-а → реален дрейф
  const mutated = original.replace(/("content":\s*")/, '$1ДРЕЙФ-ТЕСТ ');
  assert.notEqual(mutated, original, "мутацията трябва да промени файла");
  writeFileSync(OUT, mutated);
  try {
    assert.equal(run().status, 1, "променен docs.js (различен от реалните CLAUDE.md) трябва да ПАДНЕ");
  } finally {
    writeFileSync(OUT, original);
    assert.equal(readFileSync(OUT, "utf8"), original, "възстановяването се провали");
  }
});
