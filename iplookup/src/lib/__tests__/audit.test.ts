import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { appendAudit, readAudit, verifyAudit, requiresJustification, type AuditEntry } from "../audit";
import { GENESIS } from "../hash-chain";

/** Всеки тест работи в собствена папка — дневникът е глобално състояние. */
function freshDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "carbonip-audit-"));
  process.env.IPLOOKUP_AUDIT_DIR = directory;
  return directory;
}

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    ts: "2026-08-04T10:00:00.000Z",
    actor: "ivanov",
    actorUnit: "РПУ Дупница",
    actorRole: "operator",
    action: "справка",
    justification: "ДП 1/2026",
    query: "8.8.8.8",
    sources: ["RDAP"],
    ...overrides,
  };
}

test("първият запис започва от GENESIS", () => {
  freshDir();
  const record = appendAudit(entry());
  assert.equal(record.prev, GENESIS);
  assert.equal(verifyAudit().entryCount, 1);
  assert.ok(verifyAudit().intact);
});

test("всеки следващ запис сочи предишния", () => {
  freshDir();
  const first = appendAudit(entry({ query: "1.1.1.1" }));
  const second = appendAudit(entry({ query: "8.8.8.8" }));
  assert.equal(second.prev, first.hash);
  assert.ok(verifyAudit().intact);
  assert.equal(verifyAudit().tip, second.hash);
});

test("тиха промяна на ред се хваща от проверката", () => {
  const directory = freshDir();
  appendAudit(entry({ query: "1.1.1.1" }));
  appendAudit(entry({ query: "8.8.8.8" }));

  const path = join(directory, "audit.jsonl");
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const tampered = JSON.parse(lines[0]!);
  // Някой се опитва да скрие по коя преписка е направена справката.
  tampered.justification = "ДП 999/2026";
  lines[0] = JSON.stringify(tampered);
  writeFileSync(path, `${lines.join("\n")}\n`);

  const integrity = verifyAudit();
  assert.equal(integrity.intact, false);
  assert.ok(integrity.problems.some((p) => p.kind === "променено-съдържание"));
  assert.equal(integrity.tip, null, "при повреда краят не се обявява");
});

test("нечетим ред е находка, не се прескача тихо", () => {
  const directory = freshDir();
  appendAudit(entry());
  writeFileSync(join(directory, "audit.jsonl"), `${readFileSync(join(directory, "audit.jsonl"), "utf8")}не-е-json\n`);

  const integrity = verifyAudit();
  assert.deepEqual(integrity.malformedLines, [2]);
  assert.equal(integrity.intact, false);
});

test("дневник, продължаващ запечатан архив, започва от неговото звено", () => {
  const directory = freshDir();
  const sealedTip = "a".repeat(64);
  writeFileSync(join(directory, "continuation.txt"), `${sealedTip}\n`);

  const record = appendAudit(entry());
  assert.equal(record.prev, sealedTip, "новият дневник продължава архива");
  const integrity = verifyAudit();
  assert.ok(integrity.intact, "и се проверява като цял");
  assert.equal(integrity.startsFrom, sealedTip);
});

test("повредено продължение НЕ се приема — пада се на GENESIS", () => {
  const directory = freshDir();
  writeFileSync(join(directory, "continuation.txt"), "боклук\n");
  assert.equal(appendAudit(entry()).prev, GENESIS);
});

test("празният дневник е валиден", () => {
  freshDir();
  const integrity = verifyAudit();
  assert.equal(integrity.entryCount, 0);
  assert.ok(integrity.intact);
  assert.equal(integrity.tip, GENESIS);
});

test("записите се четат в реда на вписване", () => {
  freshDir();
  appendAudit(entry({ query: "1.1.1.1" }));
  appendAudit(entry({ query: "2.2.2.2" }));
  const { entries } = readAudit();
  assert.deepEqual(entries.map((e) => e.query), ["1.1.1.1", "2.2.2.2"]);
});

test("обосновката е задължителна за всичко освен вход и изход", () => {
  assert.ok(!requiresJustification("вход"));
  assert.ok(!requiresJustification("изход"));
  for (const action of ["справка", "активна-проверка", "износ", "проверка-на-дневника"] as const) {
    assert.ok(requiresJustification(action), `${action} трябва да иска обосновка`);
  }
});
