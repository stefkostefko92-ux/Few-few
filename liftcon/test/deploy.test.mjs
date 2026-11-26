// deploy.sh --solo-env: тайните се генерират, ако липсват; съществуващите не се пипат; при вече създадена база
// липсващ POSTGRES_PASSWORD/SEAL_KEY спира деплоя (спецификация т. 18а). Docker е двойник — нищо не се пуска.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, statSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEPLOY = join(dirname(fileURLToPath(import.meta.url)), "..", "deploy", "deploy.sh");

function ambiente({ volume = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "liftcon-deploy-"));
  const bin = join(dir, "bin");
  spawnSync("mkdir", ["-p", bin]);
  // Двойник на docker: само `volume inspect` (0 = томът на базата съществува).
  writeFileSync(join(bin, "docker"), `#!/bin/sh\n[ "$1 $2" = "volume inspect" ] && exit ${volume ? 0 : 1}\nexit 0\n`);
  chmodSync(join(bin, "docker"), 0o755);
  const state = join(dir, "state");
  const run = () =>
    spawnSync("bash", [DEPLOY, "--solo-env"], {
      env: { PATH: `${bin}:${process.env.PATH}`, LIFTCON_STATE_DIR: state, DOMAIN: "liftcon.it" },
      encoding: "utf8",
    });
  return { state, env: join(state, ".env"), run };
}

const leggi = (f) => Object.fromEntries(readFileSync(f, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));

test("първи деплой: .env се създава с права 600 и генерирани тайни; без администраторска парола", () => {
  const a = ambiente();
  const r = a.run();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal((statSync(a.env).mode & 0o777).toString(8), "600");
  const v = leggi(a.env);
  assert.match(v.POSTGRES_PASSWORD, /^[0-9a-f]{64}$/);
  assert.match(v.JWT_SECRET, /^[0-9a-f]{96}$/);
  assert.match(v.SEAL_KEY, /^[0-9a-f]{64}$/);
  assert.equal(v.ALLOWED_ORIGIN, "https://liftcon.it");
  assert.equal(v.MAIL_TO, "info@liftcon.it");
  assert.ok(!("ADMIN_INITIAL_PASSWORD" in v) && !("ADMIN_EMAIL" in v));
  assert.doesNotMatch(r.stdout + r.stderr, new RegExp(v.SEAL_KEY), "стойностите не се показват");
});

test("повторен деплой не сменя нищо (идемпотентен)", () => {
  const a = ambiente();
  a.run();
  const prima = readFileSync(a.env, "utf8");
  assert.equal(a.run().status, 0);
  assert.equal(readFileSync(a.env, "utf8"), prima);
});

test("празни ключове (копие на .env.example) се попълват; другите редове остават", () => {
  const a = ambiente();
  spawnSync("mkdir", ["-p", a.state]);
  writeFileSync(a.env, "ALLOWED_ORIGIN=https://liftcon.it\nBREVO_API_KEY=xkeysib-prova\nJWT_SECRET=\nPOSTGRES_PASSWORD=\nSEAL_KEY=\n", { mode: 0o600 });
  assert.equal(a.run().status, 0);
  const v = leggi(a.env);
  assert.equal(v.BREVO_API_KEY, "xkeysib-prova");
  assert.match(v.JWT_SECRET, /^[0-9a-f]{96}$/);
  assert.match(v.SEAL_KEY, /^[0-9a-f]{64}$/);
  assert.equal(readFileSync(a.env, "utf8").match(/^JWT_SECRET=/gm).length, 1, "без дублиран ключ");
});

test("съществуваща база без SEAL_KEY → деплоят спира и не генерира нов ключ", () => {
  const a = ambiente({ volume: true });
  spawnSync("mkdir", ["-p", a.state]);
  writeFileSync(a.env, "POSTGRES_PASSWORD=" + "a".repeat(64) + "\nJWT_SECRET=" + "b".repeat(96) + "\n", { mode: 0o600 });
  const r = a.run();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /SEAL_KEY/);
  assert.ok(!("SEAL_KEY" in leggi(a.env)));
});

test("съществуваща база: липсващ JWT_SECRET се генерира (само изписва всички от панела)", () => {
  const a = ambiente({ volume: true });
  spawnSync("mkdir", ["-p", a.state]);
  writeFileSync(a.env, "POSTGRES_PASSWORD=" + "a".repeat(64) + "\nSEAL_KEY=" + "c".repeat(64) + "\n", { mode: 0o600 });
  assert.equal(a.run().status, 0);
  const v = leggi(a.env);
  assert.equal(v.SEAL_KEY, "c".repeat(64));
  assert.match(v.JWT_SECRET, /^[0-9a-f]{96}$/);
});

test(".env с права, различни от 600 → отказ", () => {
  const a = ambiente();
  spawnSync("mkdir", ["-p", a.state]);
  writeFileSync(a.env, "JWT_SECRET=\n", { mode: 0o644 });
  chmodSync(a.env, 0o644);
  const r = a.run();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /600/);
  assert.ok(existsSync(a.env));
});
