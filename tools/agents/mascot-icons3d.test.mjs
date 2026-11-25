// mascot-icons3d.test.mjs — рендерът иска Chromium и CDN, затова не е в CI; тук се пази само това, което
// не иска мрежа: версията на three идва от пакета на маскота и непознат агент отказва, преди браузърът да тръгне.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CLI = fileURLToPath(new URL("./mascot-icons3d.mjs", import.meta.url));
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

test("версията на three е точна semver от mascot/cinematic/package.json (без ^ и ~)", () => {
  const v = JSON.parse(readFileSync(join(ROOT, "mascot", "cinematic", "package.json"), "utf8")).devDependencies.three.replace(/^[^\d]*/, "");
  assert.match(v, /^\d+\.\d+\.\d+$/);
});

test("иконата се пече с близка рамка, портретът — с портретна, и двете в ultra", () => {
  // Рендерът иска браузър, затова договорът с mount() се пази в изходния код: без framing иконата
  // се пече в портретна рамка и маскотът става неразличим на 128 px (дефектът преди 2026-11-14).
  const src = readFileSync(CLI, "utf8");
  assert.match(src, /framing:\s*PORTRAIT \? "portrait" : "icon"/);
  assert.match(src, /\(\{ accent, framing \}\)/, "framing стига до страницата, не само до аргумента");
  assert.match(src, /quality: "ultra"/);
});

test("пътят до Chromium не е закован към номер на билд (остарява при обновяване на средата)", () => {
  const src = readFileSync(CLI, "utf8");
  assert.doesNotMatch(src, /chromium-\d{4}/);
  assert.match(src, /CHROME_PATH/, "изричният избор остава възможен");
});

test("непознат агент → отказ, без да се стартира браузър и без запис", () => {
  const d = mkdtempSync(join(tmpdir(), "icons3d-"));
  try {
    const stub = join(d, "pw.mjs");
    const flag = join(d, "launched");
    writeFileSync(stub, `import { writeFileSync } from "node:fs";\nexport const chromium = { launch: async () => { writeFileSync(${JSON.stringify(flag)}, "1"); throw new Error("не бива"); } };\n`);
    const r = spawnSync(process.execPath, [CLI, "nyama-takav-agent"], { encoding: "utf8", timeout: 20_000, env: { ...process.env, PLAYWRIGHT_MODULE: pathToFileURL(stub).href } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /няма такива агенти/);
    assert.equal(existsSync(flag), false, "браузърът не е стартиран");
  } finally { rmSync(d, { recursive: true, force: true }); }
});
