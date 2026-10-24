import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  retentionCutoff,
  retentionCutoffMonths,
  purgeDue,
  phoneReportPurgeWhere,
  businessContactPurgeWhere,
  SEARCH_MISS_RETENTION_DAYS,
  PURGE_EVERY_MS,
  PHONE_REPORT_RESOLVED_DAYS,
  PHONE_REPORT_OPEN_MONTHS,
  BUSINESS_CONTACT_RETENTION_MONTHS,
  BUSINESS_CONTACT_SUBJECT_PREFIXES,
} from "@/lib/retention-core";

test("срокът за търсенията без резултат е 90 дни", () => {
  assert.equal(SEARCH_MISS_RETENTION_DAYS, 90);
  const now = new Date("2026-10-23T12:00:00Z");
  assert.equal(retentionCutoff(now).toISOString(), "2026-07-25T12:00:00.000Z");
  assert.equal(retentionCutoff(now, 1).toISOString(), "2026-10-22T12:00:00.000Z");
  // Нелепи стойности не изтриват всичко наведнъж.
  assert.equal(retentionCutoff(now, 0).toISOString(), "2026-10-22T12:00:00.000Z");
});

test("календарни месеци: 6 месеца и 1 година, вкл. край на месеца", () => {
  const now = new Date("2026-10-24T08:30:00.000Z");
  assert.equal(retentionCutoffMonths(now, 6).toISOString(), "2026-04-24T08:30:00.000Z");
  assert.equal(retentionCutoffMonths(now, 12).toISOString(), "2025-10-24T08:30:00.000Z");
  // 31 август − 6 месеца → последният ден на февруари (не 3 март).
  assert.equal(retentionCutoffMonths(new Date("2026-08-31T00:00:00Z"), 6).toISOString(), "2026-02-28T00:00:00.000Z");
  assert.equal(retentionCutoffMonths(new Date("2028-08-31T00:00:00Z"), 6).toISOString(), "2028-02-29T00:00:00.000Z");
  // През година назад.
  assert.equal(retentionCutoffMonths(new Date("2027-03-15T00:00:00Z"), 6).toISOString(), "2026-09-15T00:00:00.000Z");
  // Нелепи стойности не изтриват всичко наведнъж.
  assert.equal(retentionCutoffMonths(now, 0).toISOString(), "2026-09-24T08:30:00.000Z");
});

test("сигнали „Този номер е сгрешен“: поправен — 90 дни от промяната, непоправен — 1 година", () => {
  assert.equal(PHONE_REPORT_RESOLVED_DAYS, 90);
  assert.equal(PHONE_REPORT_OPEN_MONTHS, 12);
  const now = new Date("2026-10-24T12:00:00.000Z");
  assert.deepEqual(phoneReportPurgeWhere(now), {
    OR: [
      { resolved: true, updatedAt: { lt: new Date("2026-07-26T12:00:00.000Z") } },
      { resolved: false, createdAt: { lt: new Date("2025-10-24T12:00:00.000Z") } },
    ],
  });
});

test("контакти от формата за бизнес: 6 месеца от подаването, само по темите на формата", () => {
  assert.equal(BUSINESS_CONTACT_RETENTION_MONTHS, 6);
  const now = new Date("2026-10-24T12:00:00.000Z");
  assert.deepEqual(businessContactPurgeWhere(now), {
    createdAt: { lt: new Date("2026-04-24T12:00:00.000Z") },
    OR: [{ subject: { startsWith: "Нов бизнес за проверка:" } }, { subject: { startsWith: "Поправка за бизнес:" } }],
  });
});

test("формата за бизнес пише контактите с темите, по които се трият", () => {
  // Ако някой смени темата в actions.ts, триенето тихо ще пропусне записите —
  // затова всяко contactMessage.create там трябва да започва с префикс от списъка.
  const src = readFileSync(join(process.cwd(), "src/app/biznes/nova/actions.ts"), "utf8");
  const creates = [...src.matchAll(/contactMessage\.create\(\{[\s\S]*?subject:\s*`([^`$]*)/g)].map((m) => m[1]);
  assert.equal(creates.length, 2, "очаквани 2 записа на контакт (нов бизнес и поправка)");
  for (const s of creates) {
    assert.ok(
      BUSINESS_CONTACT_SUBJECT_PREFIXES.some((p) => s.startsWith(p)),
      `темата „${s}“ не е сред BUSINESS_CONTACT_SUBJECT_PREFIXES`,
    );
  }
});

test("автоматичното чистене е най-много веднъж на 12 часа", () => {
  const t = 1_000_000_000_000;
  assert.equal(purgeDue(null, t), true);
  assert.equal(purgeDue(t, t + 1000), false);
  assert.equal(purgeDue(t, t + PURGE_EVERY_MS), true);
  // Часовникът върнат назад — чистим, не блокираме завинаги.
  assert.equal(purgeDue(t, t - 1), true);
});
