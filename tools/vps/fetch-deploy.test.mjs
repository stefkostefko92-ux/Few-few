// fetch-deploy.test.mjs — регресия за H4 от одита 25.09.2026: REF влизаше без валидация в
// codeload URL-а и в името на архива. Сега само `^[A-Za-z0-9._/-]{1,200}$`, без `..`, без водещо `-`.
//
// Невалидните стойности се пускат през РЕАЛНИЯ скрипт: валидацията е преди проверката за root и
// преди всяка мрежа, значи отказът е бърз, без curl и без запис. Валидните — през самата функция
// (целият скрипт би тръгнал да сваля).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const path = join(root, "deploy", "fetch-deploy.sh");
const script = readFileSync(path, "utf8");
const validate = script.match(/^validate_ref\(\) \{\n[\s\S]*?^\}/m)?.[0];

const BAD = [
  "",                              // празен (REF="" → main по подразбиране се проверява отделно)
  "../../evil",                    // обхождане на пътя
  "main/../../x",
  "-o/tmp/x",                      // водещо `-` → опция
  "main;rm -rf /",                 // шел метасимволи
  "main$(id)",
  "main`id`",
  "main x",                        // интервал
  "main\nevil",                    // нов ред
  "клон",                          // не-ASCII
  "café",
  "a".repeat(201),                 // над 200 знака
  "main?x=1", "main#frag", "main%2e%2e",
];
const GOOD = ["main", "v1.4.0", "claude/fix-deploy_2", "09597af0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6", "a".repeat(200), "release/2026.10"];

test("validate_ref съществува в скрипта", () => assert.ok(validate));

for (const ref of BAD.filter(Boolean)) {
  test(`отказ без мрежа и без запис: ${JSON.stringify(ref).slice(0, 40)}`, () => {
    const dir = mkdtempSync(join(tmpdir(), "fetch-ref-"));
    try {
      // PATH без curl: ако валидацията пропусне, скриптът пак няма как да излезе в мрежата.
      const r = spawnSync("bash", [path], {
        env: { PATH: "/usr/bin:/bin", REF: ref, ARCHIVE_DIR: dir, HOME: dir },
        encoding: "utf8",
      });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /Невалиден REF/);
      assert.deepEqual(readdirSync(dir), [], "нищо не е записано");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("празен REF се отказва от самата функция", () => {
  const out = execFileSync("bash", ["-c", `${validate}\nvalidate_ref "" && echo OK || echo BAD`], { encoding: "utf8" });
  assert.equal(out.trim(), "BAD");
});

test("валидни клон/таг/SHA минават", () => {
  for (const ref of GOOD) {
    const out = execFileSync("bash", ["-c", `${validate}\nvalidate_ref "$1" && echo OK || echo BAD`, "_", ref],
      { encoding: "utf8", env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } });
    assert.equal(out.trim(), "OK", ref);
  }
});

test("не-ASCII се отказва и под UTF-8 локал", () => {
  for (const ref of ["клон", "café", "ﬁx"]) {
    const out = execFileSync("bash", ["-c", `${validate}\nvalidate_ref "$1" && echo OK || echo BAD`, "_", ref],
      { encoding: "utf8", env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } });
    assert.equal(out.trim(), "BAD", ref);
  }
});
