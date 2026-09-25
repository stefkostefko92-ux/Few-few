// gating-tools.test.mjs — предпазител за ПРЕДПАЗИТЕЛИТЕ.
//
// Осем инструмента реално ГЕЙТВАТ (викат се от `gate.mjs`, от продуктов workflow или от кука), но
// нямаха нито един тест. Инструмент, който решава дали промяна минава, а сам няма регресия, е
// най-скъпият вид сляпо петно: когато се счупи, той не спира да работи — той спира да ВИЖДА, а
// изходът му продължава да изглежда като „чисто".
//
// Всички са CLI скриптове без експорти и без пазач за пряко извикване, затова се проверяват като
// ПОДПРОЦЕСИ: така тестваме реалното поведение и изходния код, без рискован рефактор на шест
// гейтващи файла наведнъж.
//
// Контрактът, който всеки трябва да спазва:
//   1) не се срива (никакво изключение, никакъв изход ≥2 върху валиден вход);
//   2) произвежда изход (мълчалив гейт не може да бъде прочетен от човек);
//   3) `--json` (където се поддържа) дава ПАРСИМ JSON — таблото и CI разчитат на това.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const run = (rel, args = []) =>
  spawnSync(process.execPath, [join(ROOT, rel), ...args], { cwd: ROOT, encoding: "utf8", timeout: 120000 });

// Инструменти, които гейтват, с командата, с която реално се викат.
const GATING = [
  { rel: "tools/agents/coverage.mjs", args: ["--json"], json: true, where: "gate.mjs" },
  { rel: "tools/agents/tools-audit.mjs", args: ["--json"], json: true, where: "gate.mjs" },
  { rel: "tools/docs/doc-audit.mjs", args: [".", "--json"], json: true, where: "gate.mjs" },
  { rel: "tools/ci/workflow-audit.mjs", args: [".", "--json"], json: true, where: "кука dod-check" },
  { rel: "tools/seed/check-dups.mjs", args: [], json: false, where: "кука dod-check" },
  { rel: "tools/chrome/mv3-lint.mjs", args: ["adblock"], json: false, where: "workflow adblock/supremebot" },
];

for (const t of GATING) {
  test(`${t.rel} — не се срива и произвежда изход (гейтва: ${t.where})`, () => {
    assert.ok(existsSync(join(ROOT, t.rel)), `липсва ${t.rel}`);
    const r = run(t.rel, t.args);
    assert.notEqual(r.status, null, `${t.rel} увисна (timeout)`);
    assert.ok(r.status === 0 || r.status === 1,
      `${t.rel} излезе с ${r.status} — гейтът трябва да казва 0 (чисто) или 1 (находки), не да се срива\n${r.stderr?.slice(0, 400)}`);
    assert.ok((r.stdout || "").trim().length > 0, `${t.rel} мълчи — гейт без изход не може да бъде прочетен`);
    assert.doesNotMatch(r.stderr || "", /Error:|ERR_|Cannot find module|is not a function/,
      `${t.rel} хвърли изключение:\n${r.stderr?.slice(0, 400)}`);
  });
}

for (const t of GATING.filter((x) => x.json)) {
  test(`${t.rel} --json дава парсим JSON (таблото и CI го четат)`, () => {
    const r = run(t.rel, t.args);
    let parsed;
    assert.doesNotThrow(() => { parsed = JSON.parse(r.stdout); }, `${t.rel} --json не се парсва`);
    assert.equal(typeof parsed, "object");
    assert.notEqual(parsed, null);
  });
}

// --- Поведенчески проверки на двата най-рискови ------------------------------------

test("mv3-lint ХВАЩА разширение с прекомерни права (иначе е декорация)", () => {
  const dir = mkdtempSync(join(tmpdir(), "mv3-"));
  try {
    // `<all_urls>` + отдалечен код — точно това, което Web Store ревюто отхвърля.
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({
      manifest_version: 3, name: "probe", version: "1.0",
      permissions: ["tabs", "webRequest", "cookies", "history"],
      host_permissions: ["<all_urls>"],
      content_security_policy: { extension_pages: "script-src 'self' https://cdn.example.com" },
    }, null, 2));
    const r = run("tools/chrome/mv3-lint.mjs", [dir]);
    assert.ok(r.status === 0 || r.status === 1, `неочакван изход ${r.status}`);
    const out = (r.stdout || "") + (r.stderr || "");
    assert.match(out, /all_urls|прав|permission/i, "трябва да спомене прекомерните права");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("mv3-lint не пада върху реалните ни разширения", () => {
  for (const ext of ["adblock", "SupremeBot"]) {
    if (!existsSync(join(ROOT, ext, "manifest.json"))) continue;
    const r = run("tools/chrome/mv3-lint.mjs", [ext]);
    assert.ok(r.status === 0 || r.status === 1, `${ext}: изход ${r.status}\n${r.stderr?.slice(0, 300)}`);
  }
});

test("mv3-lint съобщава ясно при липсващ manifest, вместо да се срине", () => {
  const dir = mkdtempSync(join(tmpdir(), "mv3-empty-"));
  try {
    const r = run("tools/chrome/mv3-lint.mjs", [dir]);
    assert.notEqual(r.status, null);
    assert.doesNotMatch(r.stderr || "", /ERR_|Cannot find module/, "трябва да е съобщение, не срив");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("check-dups минава върху реалните seed файлове (пази ги от дубли)", () => {
  const r = run("tools/seed/check-dups.mjs", []);
  assert.ok(r.status === 0 || r.status === 1, `изход ${r.status}\n${r.stderr?.slice(0, 300)}`);
  assert.ok((r.stdout || "").trim().length > 0);
});

test("doc-audit --strict е отделен режим и не се срива", () => {
  const r = run("tools/docs/doc-audit.mjs", [".", "--strict"]);
  assert.ok(r.status === 0 || r.status === 1, `изход ${r.status}`);
});

test("всеки гейтващ инструмент е ЖИВ файл (регресия срещу преименуване без обновен гейт)", () => {
  for (const t of GATING) assert.ok(existsSync(join(ROOT, t.rel)), `${t.rel} не съществува — гейтът сочи в нищото`);
});
