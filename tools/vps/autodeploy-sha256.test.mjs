// autodeploy-sha256.test.mjs — гейтът за целостта на архива в deploy/autodeploy.sh е
// fail-closed: липсващ, невалиден или несъвпадащ <архив>.sha256 спира деплоя ПРЕДИ
// разопаковане; единственият изход без хеш е изричното ALLOW_UNVERIFIED_ARCHIVE=1.
//
// Тестът е ИЗПЪЛНИМ: реже истинския блок от скрипта (от `sum_file=` до затварящото
// `fi`) и го пуска с bash върху временни файлове. Мутация (напр. `die` → `warn` в
// клона без хеш, или сравнение само по префикс) → тестът пада.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = readFileSync(join(root, "deploy", "autodeploy.sh"), "utf8");

const gate = script.match(/^  sum_file="\$\{ARCHIVE_PATH\}\.sha256"\n[\s\S]*?^  fi\n/m);
const helpers = script.match(/^(?:log|ok|warn|die)\(\) .*$/gm);

test("блокът и помощниците съществуват в autodeploy.sh", () => {
  assert.ok(gate, "sha256 гейтът (sum_file=…) е в autodeploy.sh");
  assert.equal(helpers?.length, 4, "log/ok/warn/die са в autodeploy.sh");
});

test("гейтът е ПРЕДИ разопаковането", () => {
  const g = script.indexOf(gate[0]);
  assert.ok(g > 0);
  for (const unpack of ['unzip -q "$ARCHIVE_PATH"', 'tar -xzf "$ARCHIVE_PATH"']) {
    const u = script.indexOf(unpack);
    assert.ok(u > g, `${unpack} идва след проверката`);
  }
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "autodeploy-sha256-"));
  const archive = join(dir, "few-few-main.zip");
  const body = "архив за проба\n";
  writeFileSync(archive, body);
  const sum = createHash("sha256").update(body).digest("hex");
  return { dir, archive, sum };
}

function run(archive, env = {}) {
  const prog = ["set -euo pipefail", ...helpers, `ARCHIVE_PATH=${JSON.stringify(archive)}`, gate[0], 'echo "ГЕЙТЪТ ПРОПУСНА"'].join("\n");
  const r = spawnSync("bash", ["-c", prog], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...env },
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

test("валиден хеш → минава", () => {
  const t = setup();
  try {
    writeFileSync(`${t.archive}.sha256`, `${t.sum}  few-few-main.zip\n`);
    const r = run(t.archive);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /sha256 е валиден/);
    assert.match(r.out, /ГЕЙТЪТ ПРОПУСНА/);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("хеш с главни букви и друго име във файла → минава (сравнява се хешът, не името)", () => {
  const t = setup();
  try {
    writeFileSync(`${t.archive}.sha256`, `${t.sum.toUpperCase()}  друго-име.zip\n`);
    const r = run(t.archive);
    assert.equal(r.code, 0, r.out);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("липсващ .sha256 → спира (fail-closed)", () => {
  const t = setup();
  try {
    const r = run(t.archive);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /Няма few-few-main\.zip\.sha256 — спирам/);
    assert.doesNotMatch(r.out, /ГЕЙТЪТ ПРОПУСНА/);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("несъвпадащ хеш → спира", () => {
  const t = setup();
  try {
    const wrong = createHash("sha256").update("подменен архив").digest("hex");
    writeFileSync(`${t.archive}.sha256`, `${wrong}  few-few-main.zip\n`);
    const r = run(t.archive);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /sha256 НЕ съвпада — спирам/);
    assert.doesNotMatch(r.out, /ГЕЙТЪТ ПРОПУСНА/);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("несъвпадащ само в последния знак → спира (сравнява се целият хеш)", () => {
  const t = setup();
  try {
    const last = t.sum.at(-1) === "0" ? "1" : "0";
    writeFileSync(`${t.archive}.sha256`, `${t.sum.slice(0, 63)}${last}\n`);
    const r = run(t.archive);
    assert.equal(r.code, 1, r.out);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

for (const [name, content] of [
  ["празен файл", ""],
  ["къс хеш", "abc123  few-few-main.zip\n"],
  ["не-шестнадесетичен", `${"z".repeat(64)}  few-few-main.zip\n`],
]) {
  test(`невалиден .sha256 (${name}) → спира`, () => {
    const t = setup();
    try {
      writeFileSync(`${t.archive}.sha256`, content);
      const r = run(t.archive);
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /не съдържа валиден sha256/);
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  });
}

test("липсващ .sha256 + ALLOW_UNVERIFIED_ARCHIVE=1 → продължава с предупреждение", () => {
  const t = setup();
  try {
    const r = run(t.archive, { ALLOW_UNVERIFIED_ARCHIVE: "1" });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /БЕЗ проверка на целостта/);
    assert.match(r.out, /ГЕЙТЪТ ПРОПУСНА/);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

for (const v of ["yes", "true", "0", ""]) {
  test(`липсващ .sha256 + ALLOW_UNVERIFIED_ARCHIVE=${JSON.stringify(v)} → спира (само „1" отваря)`, () => {
    const t = setup();
    try {
      const r = run(t.archive, { ALLOW_UNVERIFIED_ARCHIVE: v });
      assert.equal(r.code, 1, r.out);
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  });
}

test("ALLOW_UNVERIFIED_ARCHIVE=1 НЕ заобикаля несъвпадащ хеш", () => {
  const t = setup();
  try {
    const wrong = createHash("sha256").update("подменен архив").digest("hex");
    writeFileSync(`${t.archive}.sha256`, `${wrong}\n`);
    const r = run(t.archive, { ALLOW_UNVERIFIED_ARCHIVE: "1" });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /НЕ съвпада/);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});
