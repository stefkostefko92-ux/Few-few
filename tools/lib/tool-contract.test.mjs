// tool-contract.test.mjs — базов договор за ВСЕКИ наш инструмент.
//
// Досега 31 инструмента нямаха нито един тест. Пълно поведенческо покритие за всичките е отделна,
// голяма работа; този файл затваря най-евтиния и най-често срещан клас провал: инструмент, който
// **се срива**, **виси** или **мълчи** — и затова гейтът/агентът, който го вика, получава нищо и го
// чете като „чисто". Точно този клас ме удари шест пъти в един ден.
//
// Договорът НЕ твърди, че инструментът е верен. Твърди, че е ЖИВ и ЧЕТИМ:
//   1) не хвърля необработено изключение;
//   2) излиза с дефиниран код (0 = чисто · 1 = находки · 2 = грешна употреба) — никога ≥3, никога null;
//   3) казва нещо (мълчалив изход не може да бъде прочетен от човек или от друг агент);
//   4) `--json`, където се поддържа, дава парсим JSON.
//
// Поведенческите проверки на най-рисковите (пари · GDPR · права на разширение) са отделно долу.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const run = (rel, args = [], env = {}) =>
  spawnSync(process.execPath, [join(ROOT, rel), ...args], {
    cwd: ROOT, encoding: "utf8", timeout: 90000,
    env: { ...process.env, NO_COLOR: "1", ...env },
  });

// Празна временна папка — валиден вход за инструментите, които искат път.
const EMPTY = mkdtempSync(join(tmpdir(), "toolarg-"));

// `args`: с какво се вика. `net`: пипа мрежата (тестваме само че се държи прилично без нея).
const TOOLS = [
  { rel: "tools/agents/evals/eval.mjs", args: ["--check"] },
  { rel: "tools/agents/evals/run-plan.mjs", args: [] },
  { rel: "tools/agents/flow-ledger.mjs", args: ["--report"] },
  { rel: "tools/agents/metrics.mjs", args: [] },
  { rel: "tools/agents/model-policy.mjs", args: [] },
  { rel: "tools/analytics/analytics-audit.mjs", args: ["."] },
  { rel: "tools/approval/review-check.mjs", args: ["."] },
  { rel: "tools/design/motion-a11y.mjs", args: ["."] },
  { rel: "tools/discord/discord-lint.mjs", args: ["."] },
  { rel: "tools/i18n/check-parity.mjs", args: [] },
  { rel: "tools/i18n/glossary-check.mjs", args: [EMPTY] },
  { rel: "tools/i18n/pseudo.mjs", args: [EMPTY] },
  { rel: "tools/legal/consent-scan.mjs", args: [EMPTY] },
  { rel: "tools/legal/ropa-gen.mjs", args: [EMPTY] },
  { rel: "tools/memory/curate.mjs", args: [] },
  { rel: "tools/memory/quarantine-review.mjs", args: [] },
  { rel: "tools/mobile/store-readiness.mjs", args: ["."] },
  { rel: "tools/observability/obs-audit.mjs", args: ["."] },
  { rel: "tools/print/printability.mjs", args: [EMPTY] },
  { rel: "tools/qa/test-audit.mjs", args: ["."] },
  { rel: "tools/seed/check-integrity.mjs", args: [] },
  { rel: "tools/seo/ai-bots.mjs", args: [EMPTY] },
  { rel: "tools/trading/backtest-check.mjs", args: ["treydar"] },
  // „." значи целия монорепо — това е злоупотреба, не употреба (инструментът иска папка с
  // трейдинг код). Първата версия на теста подаваше "." и се получаваше 90-секундно висене,
  // което изглеждаше като дефект в ИНСТРУМЕНТА, а беше дефект в ТЕСТА.
  { rel: "tools/trading/trader-lint.mjs", args: ["treydar"] },
];

test.after(() => rmSync(EMPTY, { recursive: true, force: true }));

for (const t of TOOLS) {
  test(`${t.rel} — жив и четим (не се срива, не виси, не мълчи)`, () => {
    assert.ok(existsSync(join(ROOT, t.rel)), `липсва ${t.rel}`);
    const r = run(t.rel, t.args);
    assert.notEqual(r.status, null, `${t.rel} увисна (timeout) — гейт, който виси, спира конвейера`);
    assert.ok([0, 1, 2].includes(r.status),
      `${t.rel} излезе с ${r.status}; договорът е 0/1/2\nstderr: ${(r.stderr || "").slice(0, 400)}`);
    const out = (r.stdout || "") + (r.stderr || "");
    assert.ok(out.trim().length > 0, `${t.rel} мълчи — изход, който никой не може да прочете`);
    assert.doesNotMatch(r.stderr || "", /Cannot find module|is not a function|Unexpected token|ERR_MODULE/,
      `${t.rel} хвърли изключение:\n${(r.stderr || "").slice(0, 400)}`);
  });
}

// --- Мрежовите: не бива да се сриват без мрежа или без аргумент ---------------------
const NET = [
  { rel: "tools/seo/cwv.mjs" },
  { rel: "tools/seo/check-jsonld.mjs" },
  { rel: "tools/seo/gsc.mjs" },
  { rel: "tools/seo/indexnow.mjs" },
];

for (const t of NET) {
  test(`${t.rel} — без аргумент дава УПОТРЕБА и изход 2, не срив`, () => {
    const r = run(t.rel, []);
    assert.notEqual(r.status, null, `${t.rel} увисна`);
    assert.ok([0, 1, 2].includes(r.status), `${t.rel} излезе с ${r.status}`);
    const out = (r.stdout || "") + (r.stderr || "");
    assert.ok(out.trim().length > 0, `${t.rel} мълчи при липсващ аргумент`);
    assert.doesNotMatch(r.stderr || "", /Cannot find module|is not a function|Unexpected token/,
      `${t.rel} се срина вместо да обясни употребата`);
  });
}

// --- Поведенчески: най-рисковите домейни -------------------------------------------

// consent-scan е РЪНТАЙМ скенер (Playwright + ЖИВ URL), не статичен обход на папка — затова тук
// няма поведенчески тест с фикстура-папка. Отделна находка, записана в дневника: при липсващ
// Playwright той излиза с код 0, тоест „успех", без да е проверил нищо. GDPR гейт, който рапортува
// успех, докато не е направил нищо, е същият клас „зелено, защото сме слепи".

test("trader-lint не пада върху реалния treydar (паричен домейн)", () => {
  if (!existsSync(join(ROOT, "treydar"))) return;
  const r = run("tools/trading/trader-lint.mjs", ["treydar"]);
  assert.ok([0, 1].includes(r.status), `изход ${r.status}\n${(r.stderr || "").slice(0, 300)}`);
  assert.ok(((r.stdout || "") + (r.stderr || "")).trim().length > 0);
});

test("quarantine-review не променя нищо (докладва, не промотира)", () => {
  const before = run("tools/memory/quarantine-review.mjs", ["--json"]);
  const after = run("tools/memory/quarantine-review.mjs", ["--json"]);
  assert.equal(before.status, 0);
  assert.equal(before.stdout, after.stdout, "два поредни рана трябва да дават еднакво — инструментът е само за четене");
  const j = JSON.parse(before.stdout);
  assert.ok(typeof j.total === "number" && j.total >= 0);
});

test("--json на инструментите, които го обявяват, е парсим", () => {
  for (const rel of ["tools/qa/test-audit.mjs", "tools/memory/quarantine-review.mjs"]) {
    const r = run(rel, rel.includes("test-audit") ? [".", "--json"] : ["--json"]);
    assert.doesNotThrow(() => JSON.parse(r.stdout), `${rel} --json не се парсва`);
  }
});
