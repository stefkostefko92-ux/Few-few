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
