// fetch-deploy-refguard.test.mjs — пазачът на ref-а по продукт в deploy/fetch-deploy.sh.
//
// Урок (2026-11-15): zabobovdol вървеше от неслят клон, а деплой с REF=main по
// подразбиране върна стария сайт — не за първи път. Текстовото правило в умението
// („провери къде е кодът“) не спря нищо. Затова сървърът помни от кой ref е разгърнат
// всеки продукт, а друг ref за същия продукт спира ПРЕДИ свалянето, докато човекът не
// го каже изрично (ALLOW_REF_SWITCH=1).
//
// Тестът е ИЗПЪЛНИМ: реже истинските функции от скрипта и ги пуска с bash върху
// временна папка. Мутация (напр. `exit 1` → `return 0`, или запис преди успешния
// autodeploy) → тестът пада.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = readFileSync(join(root, "deploy", "fetch-deploy.sh"), "utf8");
const fn = (name) => script.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}\\n`, "m"))?.[0];
const FUNCS = ["ref_key", "ref_skipped", "ref_guard_check", "ref_guard_record"];

test("функциите на пазача съществуват в fetch-deploy.sh", () => {
  for (const f of FUNCS) assert.ok(fn(f), `${f}() е в fetch-deploy.sh`);
});

test("проверката е ПРЕДИ свалянето, записът — СЛЕД успешния autodeploy", () => {
  const check = script.indexOf("\nref_guard_check\n");
  const download = script.indexOf('curl -fsSL --retry');
  const deploy = script.indexOf('ARCHIVE="$ARCHIVE_PATH" bash "$WORK/deploy/autodeploy.sh"');
  const record = script.indexOf('\nref_guard_record "$WORK/deploy/autodeploy.sh"');
  assert.ok(check > 0 && download > check, "ref_guard_check се вика преди curl");
  assert.ok(deploy > 0 && record > deploy, "ref_guard_record се вика след autodeploy.sh (под set -e — само при успех)");
  assert.match(script, /^set -euo pipefail$/m, "set -e: провален autodeploy спира скрипта преди записа");
});

function run(env, body, dir) {
  const prog = ["set -euo pipefail", ...FUNCS.map(fn), body].join("\n");
  return spawnSync("bash", ["-c", prog], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, REF_STATE_DIR: join(dir, "refs"), ...env },
  });
}

function withDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "refguard-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // Минимален autodeploy.sh със списъка по подразбиране — оттам се чете при запис без PROJECTS.
  writeFileSync(join(dir, "autodeploy.sh"), 'PROJECTS="${PROJECTS:-zabobovdol medqr gaming}"\n');
  return dir;
}

test("без запис — пропуска (първият деплой не се спира)", (t) => {
  const d = withDir(t);
  const r = run({ REF: "main", PROJECTS: "zabobovdol" }, "ref_guard_check", d);
  assert.equal(r.status, 0, r.stderr);
});

test("продукт от клон + REF=main → СПИРА и казва откъде върви", (t) => {
  const d = withDir(t);
  assert.equal(run({ REF: "claude/zabobovdol-institucionalen", PROJECTS: "zabobovdol" }, `ref_guard_record "${join(d, "autodeploy.sh")}"`, d).status, 0);
  const r = run({ REF: "main", PROJECTS: "zabobovdol" }, "ref_guard_check", d);
  assert.equal(r.status, 1, "REF=main върху продукт от клон трябва да спре");
  assert.match(r.stderr, /zabobovdol/);
  assert.match(r.stderr, /claude\/zabobovdol-institucionalen/);
  assert.match(r.stderr, /ALLOW_REF_SWITCH=1/, "казва как съзнателно да се смени");
});

test("същият ref минава; ALLOW_REF_SWITCH=1 минава съзнателно", (t) => {
  const d = withDir(t);
  run({ REF: "claude/x", PROJECTS: "zabobovdol" }, `ref_guard_record "${join(d, "autodeploy.sh")}"`, d);
  assert.equal(run({ REF: "claude/x", PROJECTS: "zabobovdol" }, "ref_guard_check", d).status, 0);
  assert.equal(run({ REF: "main", PROJECTS: "zabobovdol", ALLOW_REF_SWITCH: "1" }, "ref_guard_check", d).status, 0);
});

test("друг продукт не се спира от чужд запис", (t) => {
  const d = withDir(t);
  run({ REF: "claude/x", PROJECTS: "zabobovdol" }, `ref_guard_record "${join(d, "autodeploy.sh")}"`, d);
  assert.equal(run({ REF: "main", PROJECTS: "medqr piuma" }, "ref_guard_check", d).status, 0);
});

test("деплой на ВСИЧКИ (без PROJECTS) спира, ако един запомнен продукт е от друг ref", (t) => {
  const d = withDir(t);
  run({ REF: "claude/x", PROJECTS: "zabobovdol" }, `ref_guard_record "${join(d, "autodeploy.sh")}"`, d);
  const r = run({ REF: "main" }, "ref_guard_check", d);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /zabobovdol/);
});

test("запис без PROJECTS пише всички продукти от списъка по подразбиране на autodeploy.sh", (t) => {
  const d = withDir(t);
  assert.equal(run({ REF: "main" }, `ref_guard_record "${join(d, "autodeploy.sh")}"`, d).status, 0);
  assert.deepEqual(readdirSync(join(d, "refs")).sort(), ["gaming", "medqr", "zabobovdol"]);
  assert.match(readFileSync(join(d, "refs", "zabobovdol"), "utf8"), /^main \d{4}-\d{2}-\d{2}T/);
});

test("псевдонимите са един продукт (Gaming = aso = gaming); името не излиза от папката", (t) => {
  const d = withDir(t);
  run({ REF: "claude/x", PROJECTS: "Gaming" }, `ref_guard_record "${join(d, "autodeploy.sh")}"`, d);
  assert.equal(run({ REF: "main", PROJECTS: "aso" }, "ref_guard_check", d).status, 1, "aso е същият продукт като Gaming");
  run({ REF: "main", PROJECTS: "../../etc/x" }, `ref_guard_record "${join(d, "autodeploy.sh")}"`, d);
  for (const f of readdirSync(join(d, "refs"))) assert.doesNotMatch(f, /\//);
});

// Преглед на PR #492 (VPS-аджията): продукт, пропуснат от autodeploy.sh (напр. eternaltouch без Brevo в
// .env), върви на предишния си код — записът „разгърнат от REF“ за него би лъгал пазача.
test("пропуснат от autodeploy продукт не се записва; старият му запис остава", (t) => {
  const d = withDir(t);
  run({ REF: "claude/old", PROJECTS: "zabobovdol" }, `ref_guard_record "${join(d, "autodeploy.sh")}"`, d);
  writeFileSync(join(d, "skipped.txt"), "zabobovdol\n");
  const r = run({ REF: "main", SKIPPED_FILE: join(d, "skipped.txt") }, `ref_guard_record "${join(d, "autodeploy.sh")}"`, d);
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(d, "refs", "zabobovdol"), "utf8"), /^claude\/old /, "пропуснатият пази стария си ref");
  assert.match(readFileSync(join(d, "refs", "medqr"), "utf8"), /^main /, "останалите се записват");
});

test("fetch-deploy подава SKIPPED_FILE на autodeploy.sh", () => {
  assert.match(script, /SKIPPED_FILE="\$SKIPPED_FILE" ARCHIVE="\$ARCHIVE_PATH" bash "\$WORK\/deploy\/autodeploy\.sh"/);
});
