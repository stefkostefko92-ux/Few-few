// revenueLedger.test.js — двете дупки в паричния поток, намерени при одит (2026-08-04).
//
// 1) AGENCY ПРИХОДИТЕ ЛИПСВАХА В ОТЧЕТА. В `invoice.paid` agency клонът правеше `break`
//    ПРЕДИ `paymentLog.create`, а `calculateMRR()` (routes/admin.js) агрегира точно
//    `paymentLog`. Значи всяко agency плащане беше невидимо във финансовия регистър.
//
// 2) КОМИСИОННИТЕ НЕ СЕ НАЧИСЛЯВАХА НИКОГА. `AffiliateReferral` се четеше (`findFirst`) и
//    обновяваше (`update`), но НИКЪДЕ в монорепото не се създаваше — нула `.create`.
//    Таблицата беше вечно празна, значи `referral` винаги null и 20% не отиваха на никого.
//    Веригата беше скъсана на последното звено: `/api/affiliate/track` сетваше бисквитка
//    `bp_ref`, която нищо не четеше.
//
// Тестовете съдят ИЗХОДНИЯ КОД, защото истинските пътища искат жив Stripe + база. Това е
// съзнателен компромис: пази точно регресията (връщане на `break` преди записа, махане на
// създаването на реферал), без да симулира половин Stripe.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const stripeRoute = readFileSync(join(BACKEND, "src", "routes", "stripe.js"), "utf8");
const schema = readFileSync(join(BACKEND, "prisma", "schema.prisma"), "utf8");

/** Тялото на `case "invoice.paid"` — до следващия `case`. */
function invoicePaidBlock() {
  const start = stripeRoute.indexOf('case "invoice.paid":');
  expect(start).toBeGreaterThan(-1);
  const next = stripeRoute.indexOf("case \"", start + 20);
  return stripeRoute.slice(start, next > 0 ? next : undefined);
}

describe("agency приходите влизат във финансовия регистър", () => {
  it("agency клонът в invoice.paid записва paymentLog ПРЕДИ да прекъсне", () => {
    const block = invoicePaidBlock();
    const agencyIdx = block.indexOf("const agency = await prisma.agency.findFirst");
    const breakIdx = block.indexOf("break;", agencyIdx);
    const logIdx = block.indexOf("paymentLog.create", agencyIdx);
    expect(agencyIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeLessThan(breakIdx);
  });

  it("записът е за агенцията (agencyId), не за сървър", () => {
    const block = invoicePaidBlock();
    const seg = block.slice(block.indexOf("const agency ="), block.indexOf("const server ="));
    expect(seg).toMatch(/agencyId:\s*agency\.id/);
    expect(seg).toMatch(/description:\s*"Agency subscription payment"/);
  });

  it("сумата идва от фактурата (сървърна, цели центове) — никога от клиента", () => {
    const block = invoicePaidBlock();
    const seg = block.slice(block.indexOf("const agency ="), block.indexOf("const server ="));
    expect(seg).toMatch(/amount:\s*invoice\.amount_paid/);
    expect(seg).not.toMatch(/parseFloat|Number\(req\.|req\.body/);
  });

  it("схемата допуска и двата вида ред, с индекс по агенция", () => {
    const model = schema.slice(schema.indexOf("model PaymentLog"), schema.indexOf("model PaymentLog") + 900);
    expect(model).toMatch(/serverId\s+String\?/);
    expect(model).toMatch(/agencyId\s+String\?/);
    expect(model).toMatch(/@@index\(\[agencyId\]\)/);
  });
});

describe("афилиейт реферал се създава — веригата вече не е скъсана", () => {
  it("афилиейтът се пренася през metadata на сесията (webhook няма бисквитки)", () => {
    expect(stripeRoute).toMatch(/metadata:\s*\{[^}]*affiliateId[^}]*\}/);
  });

  it("реферал се СЪЗДАВА в проверения webhook, не при redirect", () => {
    const completed = stripeRoute.slice(stripeRoute.indexOf('case "checkout.session.completed":'));
    expect(completed).toMatch(/affiliateReferral\.create/);
    // Създаването е вътре в runOnce (идемпотентната транзакция по event.id).
    const createIdx = completed.indexOf("affiliateReferral.create");
    const runOnceIdx = completed.lastIndexOf("runOnce(", createIdx);
    expect(runOnceIdx).toBeGreaterThan(-1);
  });

  it("не се създава втори ред при повторно доставяне (проверка преди create)", () => {
    const completed = stripeRoute.slice(stripeRoute.indexOf('case "checkout.session.completed":'));
    const createIdx = completed.indexOf("affiliateReferral.create");
    const findIdx = completed.lastIndexOf("affiliateReferral.findUnique", createIdx);
    expect(findIdx).toBeGreaterThan(-1);
    expect(findIdx).toBeLessThan(createIdx);
  });

  it("само-рефериране не носи комисионна и ползва ВЕРНОТО поле (userId, не ownerUserId)", () => {
    expect(stripeRoute).toMatch(/aff\.userId\s*!==\s*req\.user\.id/);
    expect(stripeRoute).not.toMatch(/aff\.ownerUserId/);
  });

  it("бисквитката се чете от хедъра — бекендът НЯМА cookie-parser", () => {
    expect(stripeRoute).toMatch(/req\.headers\.cookie/);
    // Ако някой добави cookie-parser по-късно, това пак работи; обратното — не.
    expect(stripeRoute).not.toMatch(/req\.cookies\?\.bp_ref/);
  });

  it("начисляването на 20% остава в invoice.paid, върху сървърна сума", () => {
    const block = invoicePaidBlock();
    expect(block).toMatch(/Math\.floor\(invoice\.amount_paid\s*\*\s*0\.20\)/);
  });
});
