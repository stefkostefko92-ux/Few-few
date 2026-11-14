// supto-complete.test.ts — втората итерация към пълна декларация (docs/SUPTO-SPEC.md,
// „Втора итерация“): т. 4 подписан манифест, т. 5 час от всички драйвери, ПИН политика,
// описание на базата и безопасно обновяване на схемата. Тестовете са писани преди кода.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findDeviceSerial, parseDeviceDateTime } from "../fiscal/device-time";
import { integrityState, suptoConfigError, suptoSaleBlock } from "../fiscal/readiness";
import { pinPolicyError } from "../pin-policy";
import { parseSchemaSql, planUpgrade } from "../schema-upgrade";
import { SCHEMA_SQL } from "../schema-sql.generated";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const require = createRequire(import.meta.url);

// ── т. 5: час и ИН от отговора на ФУ ────────────────────────────────────────────────────────

test("КП-5.3: час на ФУ от XML на ZFPLab (ДД-ММ-ГГГГ ЧЧ:ММ)", () => {
  const xml = `<Res Code="0"><Res Name="DateTime" Value="14-11-2026 08:15" Type="DateTime" /></Res>`;
  assert.equal(parseDeviceDateTime(xml), "2026-11-14T08:15:00");
});

test("КП-5.3: час на ФУ от рамка на Datecs (ДД-ММ-ГГ ЧЧ:ММ:СС DST)", () => {
  const frame = "\x01 ,!>0\t14-11-26 08:15:42 DST\t\x04\x80\x80\x88\x80\x86\x9a\x80\x80\x05015;\x03";
  assert.equal(parseDeviceDateTime(frame), "2026-11-14T08:15:42");
});

test("КП-5.3: час на ФУ — точки, ISO и JSON", () => {
  assert.equal(parseDeviceDateTime("14.11.2026 23:59:59"), "2026-11-14T23:59:59");
  assert.equal(parseDeviceDateTime(`{"deviceDateTime":"2026-11-14T08:15:42"}`), "2026-11-14T08:15:42");
  assert.equal(parseDeviceDateTime("2026-11-14 07:05"), "2026-11-14T07:05:00");
});

test("КП-5.3: невалиден или липсващ час → null (не измисляме час)", () => {
  assert.equal(parseDeviceDateTime(""), null);
  assert.equal(parseDeviceDateTime("31-02-2026 10:00"), null);
  assert.equal(parseDeviceDateTime("14-11-2026 24:10"), null);
  assert.equal(parseDeviceDateTime("99-99-99 99:99"), null);
  assert.equal(parseDeviceDateTime("OK"), null);
});

test("КП-5.3: ИН на ФУ по Н-18 — две латински букви и шест цифри", () => {
  assert.equal(findDeviceSerial(`<Res Name="SerialNumber" Value="ZK123456" />`), "ZK123456");
  assert.equal(findDeviceSerial("0\tDT654321\t02517985\t"), "DT654321");
  assert.equal(findDeviceSerial("ABC1234567"), null);
  assert.equal(findDeviceSerial("zk123456"), null);
  assert.equal(findDeviceSerial(""), null);
});

// ── т. 4, т. 5, т. 20: кога режим СУПТО спира продажбата ────────────────────────────────────

test("КП-4.4: състоянието на целостта идва само от позната стойност", () => {
  assert.equal(integrityState(undefined, "development"), "dev");
  assert.equal(integrityState(undefined, "test"), "dev");
  // production сървър без проверката на Electron (напр. server.js, пуснат на ръка) → неподписан
  assert.equal(integrityState(undefined, "production"), "unsigned");
  assert.equal(integrityState("", "production"), "unsigned");
  assert.equal(integrityState("verified"), "verified");
  assert.equal(integrityState("unsigned"), "unsigned");
  assert.equal(integrityState("tampered"), "tampered");
  assert.equal(integrityState("ok"), "unsigned"); // непознато → неподписана (fail closed)
});

test("КП-4.5, КП-5.4: режим СУПТО спира продажбата без подпис или без сверен час", () => {
  const now = new Date("2026-11-14T10:00:00Z");
  const fresh = "2026-11-14T09:00:00Z";
  const base = { suptoMode: true, integrity: "verified" as const, clockSyncedAt: fresh, now };
  assert.equal(suptoSaleBlock(base), null);
  assert.equal(suptoSaleBlock({ ...base, integrity: "dev" }), null);
  assert.match(suptoSaleBlock({ ...base, integrity: "unsigned" }) ?? "", /подпис/);
  assert.match(suptoSaleBlock({ ...base, integrity: "tampered" }) ?? "", /промен/);
  assert.match(suptoSaleBlock({ ...base, clockSyncedAt: null }) ?? "", /час/);
  assert.match(suptoSaleBlock({ ...base, clockSyncedAt: "2026-11-13T09:00:00Z" }) ?? "", /час/);
  // извън режим СУПТО — нищо не се блокира
  assert.equal(suptoSaleBlock({ ...base, suptoMode: false, integrity: "unsigned", clockSyncedAt: null }), null);
});

test("КП-5.5: експерименталният Datecs LAN не се избира в режим СУПТО", () => {
  assert.match(suptoConfigError({ suptoMode: true, driver: "datecs-lan" }, { driver: "none" }) ?? "", /ErpNet/);
  assert.equal(suptoConfigError({ suptoMode: false, driver: "datecs-lan" }, { driver: "none" }), null);
  assert.equal(suptoConfigError({ suptoMode: true, driver: "erpnet" }, { driver: "none" }), null);
});

// ── Първи вход: ПИН политика ───────────────────────────────────────────────────────────────

test("КП-П.3: новият ПИН — 4–8 цифри, нетривиален, различен от стария", () => {
  assert.equal(pinPolicyError("4817"), null);
  assert.equal(pinPolicyError("90471"), null);
  assert.match(pinPolicyError("123") ?? "", /4 до 8/);
  assert.match(pinPolicyError("12a4") ?? "", /4 до 8/);
  assert.match(pinPolicyError("123456789") ?? "", /4 до 8/);
  for (const weak of ["0000", "1111", "1234", "4321", "0123", "98765"]) {
    assert.match(pinPolicyError(weak) ?? "", /лесно/, weak);
  }
  assert.match(pinPolicyError("4817", "4817") ?? "", /различен/);
});

// ── т. 4: подписан манифест на компилацията ────────────────────────────────────────────────

type Integrity = {
  buildManifest(root: string, meta: { version: string; createdAt: string }): Record<string, unknown>;
  canonicalJson(v: unknown): string;
  signManifest(text: string, privatePem: string): string;
  verifyInstall(
    root: string,
    o: { manifestText: string | null; signature: string | null; publicKeyPem: string | null }
  ): { state: "verified" | "unsigned" | "tampered"; problems: string[] };
};
const integrity = require(join(root, "desktop", "integrity.js")) as Integrity;

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "cspos-int-"));
  mkdirSync(join(dir, "node_modules", "x"), { recursive: true });
  mkdirSync(join(dir, ".next", "server"), { recursive: true });
  writeFileSync(join(dir, "server.js"), "console.log('server')");
  writeFileSync(join(dir, "node_modules", "x", "index.js"), "module.exports = 1");
  writeFileSync(join(dir, ".next", "server", "page.js"), "export default 1");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
  const manifestText = integrity.canonicalJson(
    integrity.buildManifest(dir, { version: "1.0.0", createdAt: "2026-11-14T00:00:00Z" })
  );
  const signature = integrity.signManifest(manifestText, priv);
  return { dir, pub, manifestText, signature };
}

test("КП-4.1: манифестът е каноничен и съдържа SHA-256 на всеки файл", () => {
  const f = fixture();
  try {
    const m = JSON.parse(f.manifestText) as { files: Record<string, string>; version: string };
    assert.equal(m.version, "1.0.0");
    assert.deepEqual(Object.keys(m.files), [".next/server/page.js", "node_modules/x/index.js", "server.js"]);
    for (const h of Object.values(m.files)) assert.match(h, /^[0-9a-f]{64}$/);
    assert.equal(integrity.canonicalJson({ b: 1, a: { d: 2, c: 3 } }), `{"a":{"c":3,"d":2},"b":1}`);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("КП-4.3: непокътната подписана компилация → verified", () => {
  const f = fixture();
  try {
    const r = integrity.verifyInstall(f.dir, { manifestText: f.manifestText, signature: f.signature, publicKeyPem: f.pub });
    assert.deepEqual(r, { state: "verified", problems: [] });
    // кешът на Next се пише по време на работа — не е част от компилацията
    mkdirSync(join(f.dir, ".next", "cache"), { recursive: true });
    writeFileSync(join(f.dir, ".next", "cache", "img.bin"), "x");
    assert.equal(integrity.verifyInstall(f.dir, { manifestText: f.manifestText, signature: f.signature, publicKeyPem: f.pub }).state, "verified");
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("КП-4.3: променен, добавен или липсващ файл → tampered", () => {
  const cases: Array<(dir: string) => void> = [
    (d) => writeFileSync(join(d, "server.js"), "console.log('patched')"),
    (d) => writeFileSync(join(d, "node_modules", "x", "evil.js"), "require('child_process')"),
    (d) => unlinkSync(join(d, ".next", "server", "page.js")),
  ];
  for (const change of cases) {
    const f = fixture();
    try {
      change(f.dir);
      const r = integrity.verifyInstall(f.dir, { manifestText: f.manifestText, signature: f.signature, publicKeyPem: f.pub });
      assert.equal(r.state, "tampered");
      assert.ok(r.problems.length > 0);
    } finally {
      rmSync(f.dir, { recursive: true, force: true });
    }
  }
});

test("КП-4.3: подменен манифест или чужд ключ → tampered", () => {
  const f = fixture();
  try {
    const forged = f.manifestText.replace(/"1\.0\.0"/, '"9.9.9"');
    assert.equal(integrity.verifyInstall(f.dir, { manifestText: forged, signature: f.signature, publicKeyPem: f.pub }).state, "tampered");
    const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    assert.equal(integrity.verifyInstall(f.dir, { manifestText: f.manifestText, signature: f.signature, publicKeyPem: other }).state, "tampered");
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("КП-4.4: без подпис или без публичен ключ → unsigned, но промяната пак се хваща", () => {
  const f = fixture();
  try {
    assert.equal(integrity.verifyInstall(f.dir, { manifestText: f.manifestText, signature: null, publicKeyPem: f.pub }).state, "unsigned");
    assert.equal(integrity.verifyInstall(f.dir, { manifestText: f.manifestText, signature: f.signature, publicKeyPem: null }).state, "unsigned");
    assert.equal(integrity.verifyInstall(f.dir, { manifestText: null, signature: null, publicKeyPem: f.pub }).state, "unsigned");
    writeFileSync(join(f.dir, "server.js"), "patched");
    assert.equal(integrity.verifyInstall(f.dir, { manifestText: f.manifestText, signature: null, publicKeyPem: null }).state, "tampered");
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

// ── КП-Д.2: описанието на базата следва схемата ────────────────────────────────────────────

test("КП-Д.2: docs/DATABASE.md е генериран от текущата schema.prisma", async () => {
  const { renderDatabaseDoc } = (await import(join(root, "scripts", "db-doc.mjs"))) as {
    renderDatabaseDoc: (schema: string) => string;
  };
  const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
  const committed = readFileSync(join(root, "docs", "DATABASE.md"), "utf8");
  assert.equal(committed, renderDatabaseDoc(schema), "пусни `node scripts/db-doc.mjs`");
  for (const model of ["User", "Sale", "SaleDraft", "CancelledItem", "AuditLog"]) {
    assert.match(committed, new RegExp(`^### ${model}$`, "m"));
  }
});

// ── Обновяване на базата при нова версия ───────────────────────────────────────────────────

test("обновяване: липсващи таблица, колона и индекс се добавят; нищо не се трие", () => {
  const sql = [
    `CREATE TABLE "A" (\n    "id" TEXT NOT NULL PRIMARY KEY,\n    "n" INTEGER NOT NULL DEFAULT 0,\n    "flag" BOOLEAN NOT NULL DEFAULT false\n);`,
    `CREATE TABLE "B" (\n    "id" TEXT NOT NULL PRIMARY KEY,\n    "aId" TEXT NOT NULL,\n    CONSTRAINT "B_aId_fkey" FOREIGN KEY ("aId") REFERENCES "A" ("id") ON DELETE RESTRICT ON UPDATE CASCADE\n);`,
    `CREATE UNIQUE INDEX "A_n_key" ON "A"("n");`,
  ].join("\n\n");
  const parsed = parseSchemaSql(sql);
  assert.deepEqual(parsed.tables.map((t) => t.name), ["A", "B"]);
  const plan = planUpgrade(parsed, { tables: new Map([["A", new Set(["id", "n", "legacy"])]]), indexes: new Set() });
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.statements, [
    `ALTER TABLE "A" ADD COLUMN "flag" BOOLEAN NOT NULL DEFAULT false`,
    parsed.tables[1]!.createSql,
    `CREATE UNIQUE INDEX "A_n_key" ON "A"("n");`,
  ]);
  // нищо за правене при актуална база
  const full = planUpgrade(parsed, {
    tables: new Map([["A", new Set(["id", "n", "flag"])], ["B", new Set(["id", "aId"])]]),
    indexes: new Set(["A_n_key"]),
  });
  assert.deepEqual(full, { statements: [], problems: [] });
});

test("обновяване: колона без постоянна стойност по подразбиране → отказ, не тиха поправка", () => {
  const sql = `CREATE TABLE "A" (\n    "id" TEXT NOT NULL PRIMARY KEY,\n    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    "req" TEXT NOT NULL,\n    "opt" TEXT\n);`;
  const plan = planUpgrade(parseSchemaSql(sql), { tables: new Map([["A", new Set(["id"])]]), indexes: new Set() });
  assert.deepEqual(plan.statements, [`ALTER TABLE "A" ADD COLUMN "opt" TEXT`]);
  assert.equal(plan.problems.length, 2);
  assert.match(plan.problems.join(" "), /"at"/);
  assert.match(plan.problems.join(" "), /"req"/);
});

test("обновяване: вграденият SQL на схемата е в синхрон с schema.prisma", async () => {
  const { execFileSync } = await import("node:child_process");
  const fresh = execFileSync(
    "npx",
    ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(SCHEMA_SQL.trim(), fresh.trim(), "пусни `node scripts/gen-schema-sql.mjs`");
  const parsed = parseSchemaSql(SCHEMA_SQL);
  assert.ok(parsed.tables.some((t) => t.name === "User" && t.columns.some((c) => c.name === "mustChangePin")));
});

test("КП-Д.3: версията е една и съща в програмата, package.json и инсталатора", async () => {
  const { APP_VERSION } = await import("../constants");
  const app = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
  const desktop = JSON.parse(readFileSync(join(root, "desktop", "package.json"), "utf8")) as { version: string };
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(app.version, APP_VERSION);
  assert.equal(desktop.version, APP_VERSION);
});

test("обновяване: нова връзка към съществуваща таблица запазва външния ключ (ревю, Low)", () => {
  const sql = [
    `CREATE TABLE "A" (\n    "id" TEXT NOT NULL PRIMARY KEY\n);`,
    `CREATE TABLE "B" (\n    "id" TEXT NOT NULL PRIMARY KEY,\n    "aId" TEXT,\n    "pair1" TEXT,\n    "pair2" TEXT,\n    CONSTRAINT "B_aId_fkey" FOREIGN KEY ("aId") REFERENCES "A" ("id") ON DELETE SET NULL ON UPDATE CASCADE,\n    CONSTRAINT "B_pair_fkey" FOREIGN KEY ("pair1", "pair2") REFERENCES "A" ("x", "y") ON DELETE RESTRICT ON UPDATE CASCADE\n);`,
  ].join("\n\n");
  const plan = planUpgrade(parseSchemaSql(sql), {
    tables: new Map([["A", new Set(["id"])], ["B", new Set(["id"])]]),
    indexes: new Set(),
  });
  assert.deepEqual(plan.statements, [
    `ALTER TABLE "B" ADD COLUMN "aId" TEXT REFERENCES "A" ("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  ]);
  // съставен външен ключ не се добавя с ALTER — ръчна миграция, не тиха загуба на ограничението
  assert.equal(plan.problems.length, 2);
  assert.match(plan.problems.join(" "), /"pair1"/);
});
