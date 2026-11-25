// Регресия 2026-11-02: CLI guard-ът на 74 инструмента мълчеше (exit 0) при интервал, кирилица или symlink.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const LIB = fileURLToPath(new URL("./is-main.mjs", import.meta.url));
const ROOT = join(dirname(LIB), "..", "..");

test("isMain: пускане директно, от път с интервал и кирилица и през symlink — вярно; импорт — невярно", () => {
  const d = mkdtempSync(join(tmpdir(), "is-main-"));
  try {
    const dir = join(d, "инстр ументи");
    mkdirSync(dir);
    const cli = join(dir, "cli.mjs");
    writeFileSync(cli, `import { isMain } from ${JSON.stringify(pathToFileURL(LIB).href)};\nif (isMain(import.meta.url)) console.log("ПУСНАТ");\nexport const x = 1;\n`);
    symlinkSync(cli, join(d, "link.mjs"));
    writeFileSync(join(d, "imp.mjs"), `import ${JSON.stringify(pathToFileURL(cli).href)};\n`);
    for (const target of [cli, join(d, "link.mjs")]) {
      const r = spawnSync(process.execPath, [target], { encoding: "utf8" });
      assert.match(r.stdout, /ПУСНАТ/, target);
    }
    assert.doesNotMatch(spawnSync(process.execPath, [join(d, "imp.mjs")], { encoding: "utf8" }).stdout, /ПУСНАТ/, "импортиран модул не е входна точка");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("никой наш инструмент не ползва крехкото сравнение import.meta.url === `file://${process.argv[1]}`", () => {
  const bad = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      if (n === "node_modules" || n.startsWith(".tmp")) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.m?js$/.test(n) && !/\.test\.m?js$/.test(n) && readFileSync(p, "utf8").includes("import.meta.url === `file://${process.argv[1]}`")) bad.push(p.slice(ROOT.length + 1));
    }
  };
  walk(join(ROOT, "tools"));
  walk(join(ROOT, ".claude", "hooks"));
  assert.deepEqual(bad, []);
});
