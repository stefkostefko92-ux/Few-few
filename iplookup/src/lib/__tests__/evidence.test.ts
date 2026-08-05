import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { evidenceHash, freezeEvidence, type EvidenceArtifact } from "../evidence";
import { parseIp } from "../ip";
import type { LookupReport } from "../lookup";

function freshDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "carbonip-evidence-"));
  process.env.IPLOOKUP_EVIDENCE_DIR = directory;
  return directory;
}

function report(): LookupReport {
  const ip = parseIp("8.8.8.8")!;
  return {
    ip,
    local: { special: null, embedded: null, interfaceId: null, reverse: "8.8.8.8.in-addr.arpa", globallyRoutable: true },
    rdap: { status: "ok", data: { name: "GOGL", contacts: [], remarks: [] }, source: "RDAP", sourceUrl: "x", ms: 5 },
    origin: null,
    ptr: null,
    provider: null,
    reputation: null,
    geofeed: null,
    geoip: null,
    totalMs: 5,
  };
}

const INPUT = {
  actor: "ivanov",
  actorUnit: "РПУ Дупница",
  justification: "ДП 1/2026, чл. 159а НПК",
  query: "8.8.8.8",
  now: new Date("2026-08-04T10:00:00.000Z"),
};

test("замразяването записва файл, кръстен на хеша си", () => {
  freshDir();
  const frozen = freezeEvidence({ ...INPUT, report: report() });
  assert.ok(existsSync(frozen.path));
  assert.match(frozen.path, new RegExp(`${frozen.hash}\\.json$`));
  // Подредбата по ден е нарочна: при изземване се копира цяла папка.
  assert.match(frozen.path, /2026-08-04/);
});

test("хешът е възпроизводим от самия артефакт", () => {
  freshDir();
  const frozen = freezeEvidence({ ...INPUT, report: report() });
  const fromDisk = JSON.parse(readFileSync(frozen.path, "utf8")) as EvidenceArtifact;
  // Всеки, който има артефакта, трябва да може да пресметне същия хеш и да го
  // сравни с този в дневника — без нашия софтуер.
  assert.equal(evidenceHash(fromDisk), frozen.hash);
});

test("промяна във файла разминава хеша", () => {
  freshDir();
  const frozen = freezeEvidence({ ...INPUT, report: report() });
  const artifact = JSON.parse(readFileSync(frozen.path, "utf8")) as EvidenceArtifact;
  artifact.justification = "ДП 999/2026";
  writeFileSync(frozen.path, JSON.stringify(artifact, null, 2));
  assert.notEqual(evidenceHash(artifact), frozen.hash);
});

test("артефактът носи обосновката, часа и версиите на данните", () => {
  freshDir();
  const frozen = freezeEvidence({
    ...INPUT,
    report: report(),
    datasets: { geoip: "dbip-city-lite-2026-08.mmdb" },
  });
  assert.equal(frozen.artifact.justification, "ДП 1/2026, чл. 159а НПК");
  assert.equal(frozen.artifact.frozenAt, "2026-08-04T10:00:00.000Z");
  // Версията на офлайн базата е част от възпроизводимостта: същият адрес при
  // друго издание може да даде друг град.
  assert.equal(frozen.artifact.datasets.geoip, "dbip-city-lite-2026-08.mmdb");
  assert.equal(frozen.artifact.format, 1);
});

test("два еднакви доклада дават един и същи хеш, различните — различен", () => {
  freshDir();
  const a = freezeEvidence({ ...INPUT, report: report() });
  const b = freezeEvidence({ ...INPUT, report: report() });
  assert.equal(a.hash, b.hash, "канонизацията прави хеша стабилен");

  const c = freezeEvidence({ ...INPUT, query: "1.1.1.1", report: report() });
  assert.notEqual(a.hash, c.hash);
});
