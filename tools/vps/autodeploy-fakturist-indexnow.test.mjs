// autodeploy-fakturist-indexnow.test.mjs — IndexNow за Фактурист в autodeploy.sh (собственикът, 25.11.2026:
// „да праща към търсачките“): подаването тръгва САМО след зелен деплой (код 0 на fakturist/deploy/deploy.sh),
// с ключа от fakturist/public/indexnow-key.txt и адреса му `<сайт>/<ключ>.txt`; при провал, ненастроена машина
// или FAKTURIST_INDEXNOW=0 — нищо. Тестът е ИЗПЪЛНИМ: реже реалните функции от скрипта и ги пуска с bash;
// `node` и `docker` са заглушки, които записват извикванията.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = readFileSync(join(root, "deploy", "autodeploy.sh"), "utf8");
const fn = (name) => {
  const m = script.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}`, "m"));
  assert.ok(m, `функцията ${name} съществува`);
  return m[0];
};

const KEY = "0123456789abcdef0123456789abcdef";

function run(rc, env = {}) {
  const base = mkdtempSync(join(tmpdir(), "fakturist-indexnow-"));
  const src = join(base, "few-few");
  const bin = join(base, "bin");
  const log = join(base, "calls.txt");
  mkdirSync(join(src, "fakturist", "deploy"), { recursive: true });
  mkdirSync(join(src, "fakturist", "public"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(src, "fakturist", "deploy", "deploy.sh"), `exit ${rc}\n`);
  writeFileSync(join(src, "fakturist", "public", "indexnow-key.txt"), `${KEY}\n`);
  writeFileSync(join(bin, "node"), `#!/bin/sh\necho "node $*" >> "${log}"\nexit 0\n`);
  writeFileSync(join(bin, "docker"), `#!/bin/sh\nexit 0\n`);
  chmodSync(join(bin, "node"), 0o755);
  chmodSync(join(bin, "docker"), 0o755);
  const program = [
    "set -euo pipefail",
    'log() { :; }; ok() { echo "OK $*"; }; warn() { echo "WARN $*"; }',
    "fakturist_rollback() { echo ROLLBACK; }",
    "deploy_failed=0",
    fn("fakturist_indexnow"),
    fn("deploy_fakturist"),
    "deploy_fakturist",
    'echo "failed=$deploy_failed"',
  ].join("\n");
  const out = execFileSync("bash", ["-c", program], {
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      SRC: src,
      FAKTURIST_LAST_GOOD: join(base, "shared", "last-good"),
      FAKTURIST_SHARED: join(base, "shared"),
      ...env,
    },
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
  rmSync(base, { recursive: true, force: true });
  return { out, calls };
}

test("зелен деплой → IndexNow към живия сайт с ключа и адреса му", () => {
  const { out, calls } = run(0);
  assert.match(calls, /node tools\/seo\/indexnow\.mjs https:\/\/fakturist\.carbonstealth\.eu /);
  assert.match(calls, /--key-file \S+\/fakturist\/public\/indexnow-key\.txt/);
  assert.match(calls, new RegExp(`--key-location https://fakturist\\.carbonstealth\\.eu/${KEY}\\.txt`));
  assert.match(out, /OK fakturist: IndexNow/);
  assert.match(out, /failed=0/);
});

test("друг домейн от FAKTURIST_DOMAIN; FAKTURIST_INDEXNOW=0 — без подаване", () => {
  assert.match(run(0, { FAKTURIST_DOMAIN: "fakturist.eu" }).calls, /indexnow\.mjs https:\/\/fakturist\.eu /);
  assert.equal(run(0, { FAKTURIST_INDEXNOW: "0" }).calls, "");
});

test("провал, ненастроена машина или спрян деплой — търсачките не се пипат", () => {
  for (const rc of [3, 4, 2]) {
    const { calls } = run(rc);
    assert.equal(calls, "", `код ${rc}`);
  }
});
