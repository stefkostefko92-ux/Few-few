// supto.test.ts — чистата логика зад т. 5, 6, 8, 12, 14, 18, 20 на Прил. № 29.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isLinkFresh, clockOffsetMs, suptoConfigError, LINK_MAX_AGE_MS } from "../fiscal/readiness";
import { diffCancellations } from "../draft";
import { hasTwoNames } from "../operators";
import { auditHash, verifyChain, type ChainEntry } from "../audit-chain";
import { SUPTO_TABLES, netAndVat, vatLetter, periodCurrencyError, euro } from "../supto-export";
import { buildReceiptText } from "../fiscal/receipt-text";
import { buildInvoiceText } from "../invoice-text";
import { DEFAULT_VAT_RATES } from "../vat";
import { csvCell } from "../csv";

// ── т. 8: свързаност с ФУ ────────────────────────────────────────────────────────
test("т. 8: ИН на ФУ е годен до 2 часа след последната успешна връзка", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  assert.equal(LINK_MAX_AGE_MS, 2 * 60 * 60 * 1000);
  assert.equal(isLinkFresh("2026-11-14T10:00:01Z", now), true);
  assert.equal(isLinkFresh("2026-11-14T09:59:59Z", now), false);
  assert.equal(isLinkFresh(null, now), false);
  assert.equal(isLinkFresh("2026-11-14T12:30:00Z", now), false, "връзка „от бъдещето“ не е доверена");
});

// ── т. 5: време ──────────────────────────────────────────────────────────────────
test("т. 5: отместване на часа = час на ФУ − локален час", () => {
  const local = new Date("2026-11-14T12:00:00Z");
  assert.equal(clockOffsetMs("2026-11-14T12:01:30", local, 0), 90_000);
  assert.equal(clockOffsetMs(undefined, local, 0), null);
  assert.equal(clockOffsetMs("не е дата", local, 0), null);
});

// ── т. 20: без тестов режим ──────────────────────────────────────────────────────
test("т. 20: в режим СУПТО демо драйверите са забранени", () => {
  assert.match(suptoConfigError({ suptoMode: true, driver: "demo" }, { driver: "none" }) ?? "", /демо/i);
  assert.match(suptoConfigError({ suptoMode: true, driver: "erpnet" }, { driver: "demo" }) ?? "", /терминал/i);
  assert.equal(suptoConfigError({ suptoMode: true, driver: "erpnet" }, { driver: "mypos-ecr" }), null);
  assert.equal(suptoConfigError({ suptoMode: false, driver: "demo" }, { driver: "demo" }), null);
});

// ── т. 12: анулиране ─────────────────────────────────────────────────────────────
test("т. 12: намаление и премахване на ред се отчитат като анулирани количества", () => {
  const prev = [
    { uid: "a", productId: "p1", qtyMilli: 3000 },
    { uid: "b", productId: "p2", qtyMilli: 1000 },
    { uid: "c", productId: "p3", qtyMilli: 250 },
  ];
  const next = [
    { uid: "a", productId: "p1", qtyMilli: 1000 }, // −2 бр.
    { uid: "c", productId: "p3", qtyMilli: 400 }, // увеличение — не е анулиране
    { uid: "d", productId: "p4", qtyMilli: 1000 }, // нов ред
  ];
  assert.deepEqual(diffCancellations(prev, next), [
    { uid: "a", productId: "p1", qtyMilli: 2000 },
    { uid: "b", productId: "p2", qtyMilli: 1000 },
  ]);
  assert.deepEqual(diffCancellations(prev, []).map((c) => c.qtyMilli), [3000, 1000, 250]);
});

// ── т. 6: оператори ──────────────────────────────────────────────────────────────
test("т. 6: операторът има поне две имена", () => {
  assert.equal(hasTwoNames("Иван Иванов"), true);
  assert.equal(hasTwoNames("  Мария   Петрова  Георгиева "), true);
  assert.equal(hasTwoNames("Иван"), false);
  assert.equal(hasTwoNames("И. И."), false, "инициалите не са имена");
});

// ── т. 4/13: хеш верига на дневника ──────────────────────────────────────────────
test("хеш веригата открива подменен и изтрит запис", () => {
  const base: Omit<ChainEntry, "hash" | "prevHash">[] = [
    { id: "1", createdAt: "2026-11-14T10:00:00.000Z", userId: "u", action: "LOGIN", entity: null, entityId: null, unp: null, detail: null },
    { id: "2", createdAt: "2026-11-14T10:01:00.000Z", userId: "u", action: "SALE_ANNULLED", entity: "SaleDraft", entityId: "d1", unp: "DT000001-0001-0000001", detail: "{}" },
    { id: "3", createdAt: "2026-11-14T10:02:00.000Z", userId: "u", action: "LOGOUT", entity: null, entityId: null, unp: null, detail: null },
  ];
  let prev = "";
  const chain: ChainEntry[] = base.map((e) => {
    const hash = auditHash(prev, e);
    const row = { ...e, prevHash: prev, hash };
    prev = hash;
    return row;
  });
  assert.deepEqual(verifyChain(chain), { ok: true, checked: 3 });
  const tampered = chain.map((e) => (e.id === "2" ? { ...e, unp: "DT000001-0001-0000009" } : e));
  assert.deepEqual(verifyChain(tampered), { ok: false, checked: 1, brokenAt: "2" });
  const removed = [chain[0]!, chain[2]!];
  assert.equal(verifyChain(removed).ok, false);
});

// ── т. 18: справки ───────────────────────────────────────────────────────────────
test("т. 18: деветте справки са налице с колоните от наредбата", () => {
  assert.deepEqual(
    SUPTO_TABLES.map((t) => t.id),
    ["18.1", "18.2", "18.3", "18.4", "18.5", "18.6", "18.7", "18.8", "18.9"]
  );
  const t181 = SUPTO_TABLES.find((t) => t.id === "18.1")!;
  for (const col of ["УНП", "Системен номер", "Код на работно място", "Код на оператор", "Сума без ДДС (EUR)", "Отстъпка (EUR)", "ДДС (EUR)", "Дължима сума (EUR)"]) {
    assert.ok(t181.headers.includes(col), `18.1 без колона „${col}“`);
  }
});

test("т. 18: сумите са в евро с два знака, групите — с кирилски букви", () => {
  assert.equal(euro(12345), "123.45");
  assert.equal(euro(-5), "-0.05");
  assert.deepEqual(netAndVat(1200, 200), { net: 1000, vat: 200 });
  assert.equal(vatLetter("B"), "Б");
  assert.equal(vatLetter("C"), "В");
  assert.equal(vatLetter("D"), "Г");
  assert.equal(vatLetter("A"), "А");
});

test("§ 74 ПЗР: период, пресичащ 01.01.2026, се прави на две справки", () => {
  assert.match(periodCurrencyError("2025-12-15", "2026-01-15") ?? "", /две/);
  assert.equal(periodCurrencyError("2026-01-01", "2026-11-14"), null);
  assert.equal(periodCurrencyError(null, null), null);
});

// ── т. 14: без „фискален“ в нефискални документи ─────────────────────────────────
test("т. 14: примерният бон и фактурата не съдържат „фискал…“", () => {
  const store = {
    name: "Демо ЕООД", eik: "000000000", vatNumber: "BG000000000", mol: "Иван Иванов", code: "1",
    storeName: "Магазин", address: "ул. 1", city: "София", phone: "", footerText: "Благодарим!",
  };
  const data = {
    unp: "DT000001-0001-0000001", operatorCode: 1, operatorName: "Иван Иванов",
    items: [{ name: "Вода", qtyMilli: 1000, unitLabel: "бр.", unitPriceCents: 199, vatGroup: "B" as const, discountPermille: 0, totalCents: 199 }],
    payments: [{ type: "CASH" as const, amountCents: 199 }], totalCents: 199, changeCents: 0, dualDisplay: false,
  };
  const receipt = buildReceiptText(store, data, DEFAULT_VAT_RATES, { receiptNumber: "0000001", deviceSerial: "DT000001", fiscalMemoryNumber: "00000001" });
  assert.doesNotMatch(receipt, /фискал/i);
  const invoice = buildInvoiceText(store, { name: "Купувач ООД" }, [{ name: "Вода", qtyMilli: 1000, unitLabel: "бр.", unitPriceCents: 199, vatGroup: "B", vatRatePermille: 200, totalCents: 199, vatCents: 33 }], { number: 1, date: new Date(), fiscalReceiptNo: "0000001", dualDisplay: false });
  assert.doesNotMatch(invoice, /фискал/i);
});

// ── ревю L1: CSV/формула инжекция ────────────────────────────────────────────────
test("CSV: текст, започващ с формула, се неутрализира; числата остават числа", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell("+359 88"), "'+359 88");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("-0.05"), "-0.05");
  assert.equal(csvCell("-12"), "-12");
  assert.equal(csvCell("Хляб"), "Хляб");
});
