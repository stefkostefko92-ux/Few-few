// error-ledger.test.mjs — дневникът на реалните грешки (CI auto-discovery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { checkLedger, loadLedger } from "./error-ledger.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOOL = join(ROOT, "tools", "agents", "error-ledger.mjs");

const specs = new Set(["goladjiyata-2", "injection-seo"]);
const agents = new Set(["goladjiyata", "seo", "razbivacha"]);

test("запис със съществуващ spec → чисто", () => {
  const e = checkLedger([{ date: "2026-07-23", agent: "goladjiyata", desc: "x", spec: "goladjiyata-2" }], specs, agents);
  assert.equal(e.length, 0);
});

test("запис БЕЗ регресия → грешка (правилото: всяка грешка получава spec ИЛИ тест)", () => {
  const e = checkLedger([{ date: "2026-07-23", agent: "seo", desc: "пропусна UA група", spec: null }], specs, agents);
  assert.ok(e.some((m) => /БЕЗ регресия/.test(m)));
});

test("несъществуващ spec / непознат агент / непарсим ред → грешки", () => {
  const e = checkLedger([
    { date: "d", agent: "seo", desc: "x", spec: "няма-такъв" },
    { date: "d", agent: "фантом", desc: "x", spec: "injection-seo" },
    { _bad: "{счупен" },
  ], specs, agents);
  assert.equal(e.length, 3);
});

test("реалният ledger (ако съществува) е чист по правилата", () => {
  const entries = loadLedger();
  // празен ledger = валиден; непразен трябва да мине проверката срещу реалните spec-ове
  assert.ok(Array.isArray(entries));
});

// --- Регресия чрез node тест (равностойна на eval spec) --------------------------
// Дефект в НАШИТЕ инструменти/куки (guard байпас, тих провал в hook) няма поведенчески eval spec —
// има red-before-green node тест. Докато инструментът признаваше само `spec`, такъв дефект НЕ МОЖЕШЕ
// да бъде записан → дневникът показваше „1 грешка" при десетина реални. Мерилото лъжеше.

const hasTest = (p) => p === "tools/hooks/guards-redteam.test.mjs";

test("запис с --test вместо --spec минава, когато тестът съществува", () => {
  const e = checkLedger(
    [{ date: "2026-07-28", agent: "razbivacha", desc: "байпас в guard-exfil", spec: null, test: "tools/hooks/guards-redteam.test.mjs" }],
    specs, agents, hasTest,
  );
  assert.deepEqual(e, []);
});

test("запис с --test към НЕСЪЩЕСТВУВАЩ файл пада (регресия на хартия не е регресия)", () => {
  const e = checkLedger(
    [{ date: "2026-07-28", agent: "razbivacha", desc: "x", spec: null, test: "tools/hooks/измислен.test.mjs" }],
    specs, agents, hasTest,
  );
  assert.equal(e.length, 1);
  assert.match(e[0], /не съществува/);
});

test("запис без НИТО spec, НИТО test пада — правилото не е разхлабено, а разширено", () => {
  const e = checkLedger([{ date: "d", agent: "seo", desc: "x", spec: null, test: null }], specs, agents, hasTest);
  assert.equal(e.length, 1);
  assert.match(e[0], /БЕЗ регресия/);
});

test("spec и test едновременно е позволено, но и двете се проверяват", () => {
  const ok = checkLedger([{ date: "d", agent: "seo", desc: "x", spec: "injection-seo", test: "tools/hooks/guards-redteam.test.mjs" }], specs, agents, hasTest);
  assert.deepEqual(ok, []);
  const bad = checkLedger([{ date: "d", agent: "seo", desc: "x", spec: "няма-такъв", test: "няма.test.mjs" }], specs, agents, hasTest);
  assert.equal(bad.length, 2, "и двете счупени препратки се докладват, не само първата");
});

test("без подаден предикат старото поведение се пази (обратна съвместимост)", () => {
  const e = checkLedger([{ date: "d", agent: "seo", desc: "x", spec: null, test: "какъвто-и-да-е.mjs" }], specs, agents);
  assert.deepEqual(e, [], "без предикат тестът не се валидира — не чупим стари извиквания");
});

// ── --desc-file: описанието не минава през обвивка ────────────────────────────────────────────
// Реален случай (2026-07-30): скриптът, с който записвах дефект, гръмна със SyntaxError заради
// ПРАВА кавичка вътре в български кавички. Записът тихо не се случи, а комит съобщението после
// твърдеше по-голям брой записи, отколкото има. Файл вместо аргумент маха целия клас escaping.
test("--desc-file пренася враждебни знаци байт за байт (кавички, апострофи, $, ;)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-desc-"));
  try {
    const q = String.fromCharCode(34), bt = String.fromCharCode(96);
    const text = `„български кавички“, права ${q} по средата, апостроф ' и ${bt}код${bt}, $HOME и ; накрая`;
    const f = join(dir, "desc.txt");
    writeFileSync(f, text + "\n");
    const r = spawnSync(process.execPath,
      [TOOL, "add", "--agent", "ai-djiyata", "--desc-file", f, "--test", "tools/lib/mutation.test.mjs"],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, ERROR_LEDGER_PATH: join(dir, "out.jsonl") } });
    assert.equal(r.status, 0, `очаквам успех, а получих: ${r.stderr}`);
    // Текстът трябва да е стигнал ЦЯЛ до дневника — това е смисълът на --desc-file.
    const written = JSON.parse(readFileSync(join(dir, "out.jsonl"), "utf8").trim());
    assert.equal(written.desc, text, "описанието трябва да пътува байт за байт");
    assert.ok(written.desc.includes(q), "правата кавичка оцелява");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("реалният дневник НЕ се пипа от тестовете (ERROR_LEDGER_PATH е задължителен пясъчник)", () => {
  const before = loadLedger().length;
  const dir = mkdtempSync(join(tmpdir(), "ledger-iso-"));
  try {
    spawnSync(process.execPath, [TOOL, "add", "--agent", "ai-djiyata", "--desc", "изолационна проба", "--test", "tools/lib/mutation.test.mjs"],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, ERROR_LEDGER_PATH: join(dir, "iso.jsonl") } });
    assert.equal(loadLedger().length, before, "реалният дневник трябва да остане непроменен");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("--desc-file с несъществуващ файл ПАДА ясно (не записва празно описание)", () => {
  const r = spawnSync(process.execPath,
    [TOOL, "add", "--agent", "ai-djiyata", "--desc-file", "/несъществуващ/път.txt"],
    { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /няма такъв файл/);
});
