// new-deps.test.mjs — новите пакети в lock файловете: typosquat гейтва, останалото предупреждава.
import { test } from "node:test";
import assert from "node:assert/strict";
import { typosquatOf, parseLock, analyze } from "./new-deps.mjs";

const lock = (pkgs) => JSON.stringify({ lockfileVersion: 3, packages: { "": { name: "app" }, ...Object.fromEntries(Object.entries(pkgs).map(([n, v]) => [`node_modules/${n}`, { version: "1.0.0", resolved: `https://registry.npmjs.org/${n}/-/x.tgz`, integrity: "sha512-x", ...v }])) } });

test("typosquat: една редакция, транспозиция, разменени разделители, объркан scope", () => {
  assert.equal(typosquatOf("expres"), "express");
  assert.equal(typosquatOf("lodahs"), "lodash");
  assert.equal(typosquatOf("reactdom"), "react-dom");
  assert.equal(typosquatOf("discordjs"), "discord.js");
  assert.equal(typosquatOf("@prisma/clinet"), "@prisma/client");
});

test("калибровка 31.10: истински scoped „близнаци“ и познати имена не се маркират", () => {
  for (const n of ["@prisma/debug", "@discordjs/ws", "@sentry/react", "@phosphor-icons/react", "gaxios", "preact"]) assert.equal(typosquatOf(n), null, n);
});

test("typosquat: истинските и несвързаните имена минават (нула фалшиви)", () => {
  for (const n of ["express", "react", "next", "zod", "pg", "ws", "@prisma/client", "express-validator", "nextra", "preact", "ioredis", "redis", "vitest", "jest-dom", "@types/express"]) {
    assert.equal(typosquatOf(n), null, n);
  }
});

test("analyze: само новите пакети; install скрипт, git източник и липсващ integrity предупреждават", () => {
  const before = lock({ express: {} });
  const after = lock({ express: {}, expres: {}, "left-pad": { hasInstallScript: true }, gitdep: { resolved: "git+https://github.com/x/y.git" }, nohash: { integrity: undefined } });
  const f = analyze(before, after, "app/package-lock.json");
  const by = (k) => f.filter((x) => x.kind === k).map((x) => x.name);
  assert.deepEqual(by("typosquat"), ["expres"]);
  assert.deepEqual(by("install-script"), ["left-pad"]);
  assert.deepEqual(by("non-registry"), ["gitdep"]);
  assert.deepEqual(by("no-integrity"), ["nohash"]);
  assert.ok(!f.some((x) => x.name === "express"), "съществуващ пакет не е нов");
  assert.ok(f.filter((x) => x.gate).every((x) => x.kind === "typosquat"), "гейтва само typosquat");
});

test("pnpm-lock: имената се четат и с scope", () => {
  const m = parseLock("lockfileVersion: '9.0'\npackages:\n\n  '@prisma/client@6.1.0':\n    resolution: {}\n  expres@1.0.0:\n    resolution: {}\n", "Gaming/pnpm-lock.yaml");
  assert.ok(m.has("@prisma/client") && m.has("expres"));
  assert.equal(analyze("", "packages:\n  expres@1.0.0:\n", "x/pnpm-lock.yaml")[0].kind, "typosquat");
});

test("pnpm-lock: версиите се четат (и peer суфиксът се реже)", () => {
  const m = parseLock("packages:\n\n  '@prisma/client@6.1.0(prisma@6.1.0)':\n    resolution: {}\n  expres@1.0.0:\n  expres@1.2.0:\n", "x/pnpm-lock.yaml");
  assert.deepEqual([...m.get("expres").versions], ["1.0.0", "1.2.0"]);
  assert.deepEqual([...m.get("@prisma/client").versions], ["6.1.0"]);
});

test("pnpm-lock: git/tarball зависимост (URL като версия) вече се вижда като non-registry", () => {
  const head = "packages:\n  express@4.0.0:\n  'evil-lib@https://codeload.github.com/x/y/tar.gz/abc':\n    resolution: {}\n";
  const f = analyze("packages:\n  express@4.0.0:\n", head, "x/pnpm-lock.yaml");
  assert.deepEqual(f.filter((x) => x.kind === "non-registry").map((x) => x.name), ["evil-lib"]);
});

test("pnpm-lock: нова git версия на ПОЗНАТО име не се губи", () => {
  const f = analyze("packages:\n  express@4.0.0:\n", "packages:\n  express@4.0.0:\n  express@https://evil.example/e.tgz:\n", "x/pnpm-lock.yaml");
  assert.deepEqual(f.map((x) => [x.name, x.kind]), [["express", "non-registry"]]);
  assert.deepEqual(analyze("packages:\n  express@4.0.0:\n", "packages:\n  express@4.0.0:\n  express@4.1.0:\n", "x/pnpm-lock.yaml"), [], "нормален bump не е сигнал");
});

test("yarn.lock v1 и berry: имена, версии, resolved", () => {
  const v1 = '# yarn lockfile v1\n\nexpres@^1.0.0, expres@^1.1.0:\n  version "1.1.0"\n  resolved "https://registry.yarnpkg.com/expres/-/expres-1.1.0.tgz#abc"\n  integrity sha512-x\n\n"@scope/pkg@^2":\n  version "2.0.0"\n  resolved "https://evil.example/pkg.tgz"\n';
  const m = parseLock(v1, "app/yarn.lock");
  assert.deepEqual([...m.get("expres").versions], ["1.1.0"]);
  assert.ok(m.has("@scope/pkg"));
  const f = analyze("", v1, "app/yarn.lock");
  assert.deepEqual(f.filter((x) => x.gate).map((x) => x.name), ["expres"]);
  assert.deepEqual(f.filter((x) => x.kind === "non-registry").map((x) => x.name), ["@scope/pkg"]);
  const berry = '__metadata:\n  version: 8\n\n"expres@npm:^1.0.0":\n  version: 1.0.0\n  resolution: "expres@npm:1.0.0"\n';
  assert.deepEqual([...parseLock(berry, "a/yarn.lock").get("expres").versions], ["1.0.0"]);
});
