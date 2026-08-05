// tools/memory/curate.test.mjs — регресия за ЧИСЛОВИЯ класификатор на curate (2026-07-30).
//
// Защо: „18-те противоречия“ се оказаха 3 корупции + 14 парафрази + 1 закръгление — НУЛА реални
// числови противоречия. Класификаторът numTokens/numDiff отличава ПАРАФРАЗ (числата съвпадат →
// безопасно сливане) от ИСТИНСКО противоречие (числата се разминават → човек). Тези тестове пазят:
//  (1) идентичните числа → match; (2) реална разлика (ξ 0.0065≠0.0019) → НЕ match, с точните числа;
//  (3) идентификаторни цифри залепени за буква (B2C, MV3, SHA256) НЕ броят за количество;
//  (4) хилядни разделители се нормализират (52,428,800 === 52428800).

import { test } from "node:test";
import assert from "node:assert/strict";
import { numTokens, numDiff } from "./curate.mjs";

test("numDiff: идентични числа в парафраз → match", () => {
  const a = "SCA праг = 30 EUR (25 GBP); над 100 EUR или 5 транзакции иска requires_action";
  const b = "SCA праг 30 EUR (25 GBP); кумулативно над 100 EUR ИЛИ 5 транзакции → requires_action";
  const d = numDiff(a, b);
  assert.equal(d.match, true, "същите числа трябва да дадат match");
  assert.deepEqual(d.onlyA, []);
  assert.deepEqual(d.onlyB, []);
});

test("numDiff: реално количествено противоречие → НЕ match, показва двете стойности", () => {
  const a = "time-decay ξ = 0.0065 на ден";
  const b = "time-decay ξ = 0.0019 на ден";
  const d = numDiff(a, b);
  assert.equal(d.match, false, "различните количества НЕ трябва да дадат match");
  assert.ok(d.onlyA.includes("0.0065"));
  assert.ok(d.onlyB.includes("0.0019"));
});

test("numDiff: закръгление 95.91 vs 96 се флагва (консервативно, за човек)", () => {
  const a = "physical thread е 95.91% от rebuild времето";
  const b = "physical thread е ~96% от rebuild времето";
  assert.equal(numDiff(a, b).match, false);
});

test("numTokens: идентификаторни цифри залепени за буква НЕ броят (B2C, MV3, SHA256)", () => {
  const t = numTokens("customer status (B2B/B2C/exempt) с MV3 и SHA256");
  assert.ok(!t.has("2"), "‚2‘ от B2C не е количество");
  assert.ok(!t.has("3"), "‚3‘ от MV3 не е количество");
  assert.ok(!t.has("256"), "‚256‘ от SHA256 не е количество");
});

test("numTokens: самостоятелно количество СЕ хваща (за да не маскираме реално противоречие)", () => {
  const t = numTokens("прагът е 2048 бита, курсът 1.95583");
  assert.ok(t.has("2048"));
  assert.ok(t.has("1.95583"));
});

test("numTokens: хилядни разделители се нормализират (52,428,800 === 52428800)", () => {
  const withSep = numTokens("лимит 52,428,800 байта");
  const noSep = numTokens("лимит 52428800 байта");
  assert.ok(withSep.has("52428800"), "запетаите като хилядни разделители се махат");
  assert.ok(noSep.has("52428800"));
  assert.equal(numDiff("лимит 52,428,800 байта", "лимит 52428800 байта").match, true);
});

test("numTokens: версия-низ се пази цял (2026-06-24.dahlia)", () => {
  const t = numTokens("Stripe API 2026-06-24.dahlia");
  assert.ok(t.has("2026-06-24.dahlia"), "версията е един токен, не се цепи");
});

// ── Кръг 12 (2026-08-04): гейт-режимът `--check` ────────────────────────────────────────────────
// Реален дефект: `curate.mjs` беше способен, документиран като процедура в 5+ дефиниции — и НЕ се
// викаше от нищо (`grep -c curate tools/agents/gate.mjs` → 0; нула в settings.json; нула в CI).
// Спящ инструмент = нула. Точно тогава в паметта имаше 2 точни дубла. Сега `--check` е в гейта.
//
// Тестовете пускат ИНСТРУМЕНТА върху фикстура (CURATE_MEM_DIR), не върху живата памет — иначе биха
// съдили СЪСТОЯНИЕТО на репото („днес няма дубли“), а не поведението на кода.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CURATE = join(dirname(fileURLToPath(import.meta.url)), "curate.mjs");
const LESSON = '- **2026-08-04:** Едно и също твърдение. _(обхват; high; "източник")_';

/** Пуска curate със зададени аргументи върху временна папка-памет. Връща {code, out}. */
function runCurate(files, args) {
  const dir = mkdtempSync(join(tmpdir(), "curate-"));
  try {
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    let code = 0, out = "";
    try {
      out = execFileSync(process.execPath, [CURATE, ...args],
        { env: { ...process.env, CURATE_MEM_DIR: dir }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) { code = e.status; out = String(e.stdout || "") + String(e.stderr || ""); }
    return { code, out, read: (n) => readFileSync(join(dir, n), "utf8") };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const clean = `## Проверени поуки (verified)\n\n${LESSON}\n\n## Карантина (непроверени — НЕ са факт)\n\n`;
const dupVerified = `## Проверени поуки (verified)\n\n${LESSON}\n${LESSON}\n\n## Карантина (непроверени — НЕ са факт)\n\n`;
const dupQuarantine = `## Проверени поуки (verified)\n\n## Карантина (непроверени — НЕ са факт)\n\n${LESSON}\n${LESSON}\n`;

test("--check: чиста памет → изход 0", () => {
  const r = runCurate({ "a.md": clean }, ["--check"]);
  assert.equal(r.code, 0, r.out);
});

test("--check: ТОЧЕН дублат в „Проверени поуки“ → изход 1 (зъбите на гейта)", () => {
  const r = runCurate({ "a.md": dupVerified }, ["--check"]);
  assert.equal(r.code, 1, `гейтът трябва да падне, а върна 0:\n${r.out}`);
  assert.match(r.out, /1 точни дубли/);
});

test("--check: дублат и в „Карантина“ се хваща (секцията също се дедупва)", () => {
  const r = runCurate({ "a.md": dupQuarantine }, ["--check"]);
  assert.equal(r.code, 1, r.out);
});

test("--check: изходът казва КОЯ поука е дублат (иначе гейтът е неизползваем)", () => {
  const r = runCurate({ "a.md": dupVerified }, ["--check"]);
  assert.match(r.out, /ТОЧЕН ДУБЛАТ/);
  assert.match(r.out, /Едно и също твърдение/, "поуката трябва да се вижда, не само броят");
});

test("--check НЕ пише, дори с --write (гейтът е само отчет, не мутира паметта в CI)", () => {
  const dir = mkdtempSync(join(tmpdir(), "curate-"));
  try {
    writeFileSync(join(dir, "a.md"), dupVerified);
    try {
      execFileSync(process.execPath, [CURATE, "--check", "--write"],
        { env: { ...process.env, CURATE_MEM_DIR: dir }, encoding: "utf8", stdio: "pipe" });
    } catch { /* очаквано: изход 1 */ }
    assert.equal(readFileSync(join(dir, "a.md"), "utf8"), dupVerified, "файлът трябва да е непокътнат");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--write (без --check) РЕАЛНО маха дубла и пази едно копие", () => {
  const dir = mkdtempSync(join(tmpdir(), "curate-"));
  try {
    writeFileSync(join(dir, "a.md"), dupVerified);
    execFileSync(process.execPath, [CURATE, "--write"],
      { env: { ...process.env, CURATE_MEM_DIR: dir }, encoding: "utf8", stdio: "pipe" });
    const after = readFileSync(join(dir, "a.md"), "utf8");
    assert.equal(after.split(LESSON).length - 1, 1, "точно едно копие остава");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Първата версия на този тест мереше ВРЕМЕ („--check под 3000ms"). Няма зъби: на 120 поуки и
// ПЪЛНИЯТ ход отнема 0.275s — прагът минаваше и с махнат `!CHECK` guard. (Реалните 11s идват от
// целия корпус, не от една фикстура.) Времето е проксѝ; инвариантът е СТРУКТУРЕН — `--check` не
// трябва да произвежда изобщо преценъчните сигнали. Същият урок, който вече е записан на две места:
// съди поведение, не заместител.
const judgementFixture =
  "## Проверени поуки (verified)\n\n" +
  // Две почти-еднакви (Jaccard ≥ SIM_THRESHOLD, но НЕ точен дублат) → пълният ход ги вика „парафраз“.
  '- **2026-08-04:** Кешът на префикса пада при различен системен блок между агентите, затова първа паралелна вълна е студена. _(обхват; high; "източник")_\n' +
  '- **2026-08-04:** Кешът на префикса пада при различен системен блок между агентите, значи първа паралелна вълна винаги е студена. _(обхват; high; "източник")_\n' +
  // Време-чувствителна и стара → пълният ход я вика „застаряло“.
  '- **2026-01-02:** Текущата версия на инструмента е v3.4 и това е stable release. _(обхват; high; "източник")_\n' +
  "\n## Карантина (непроверени — НЕ са факт)\n\n";

test("пълният ход ДАВА преценъчните сигнали (предпоставка — иначе следващият тест е празен)", () => {
  const r = runCurate({ "a.md": judgementFixture }, []);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /парафраз/, "две почти-еднакви поуки трябва да се флагнат");
  assert.match(r.out, /застаряло/, "стара време-чувствителна поука трябва да се флагне");
});

test("--check НЕ произвежда преценъчните сигнали (парафраз/застаряло) — само механичния дедуп", () => {
  const r = runCurate({ "a.md": judgementFixture }, ["--check"]);
  assert.equal(r.code, 0, `няма ТОЧЕН дублат → гейтът минава:\n${r.out}`);
  assert.doesNotMatch(r.out, /парафраз/, "--check пак пуска O(n²) сравненията по прилика");
  assert.doesNotMatch(r.out, /застаряло/, "--check пак пуска проверката за застаряване");
  assert.doesNotMatch(r.out, /ЧИСЛА СЕ РАЗЛИЧАВАТ/, "--check пак пуска числовия класификатор");
});
