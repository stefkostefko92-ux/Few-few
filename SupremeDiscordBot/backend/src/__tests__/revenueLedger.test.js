// revenueLedger.test.js — AGENCY ПРИХОДИТЕ ЛИПСВАХА В ОТЧЕТА (одит 2026-08-04).
//
// В `invoice.paid` agency клонът правеше `break` ПРЕДИ `paymentLog.create`, а
// `calculateMRR()` (routes/admin.js) агрегира точно `paymentLog`. Значи всяко agency
// плащане беше невидимо във финансовия регистър.
//
// Втората находка от същия одит — че `AffiliateReferral` не се създаваше никъде, значи
// комисионните не се начисляваха никога — е ЗАТВОРЕНА по друг начин: собственикът реши
// (07.08.2026) афилиейт програмата да отпадне изцяло, вместо да се дострои. Виж
// миграция `20260816000000_v39_drop_affiliate`. Затова тук няма афилиейт тестове —
// тест за махната функция е тест, който пази мъртъв код.
//
// Тестовете съдят ИЗХОДНИЯ КОД, защото истинските пътища искат жив Stripe + база. Това е
// съзнателен компромис: пази точно регресията (връщане на `break` преди записа), без да
// симулира половин Stripe.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schema = readFileSync(join(BACKEND, "prisma", "schema.prisma"), "utf8");

/**
 * Маха коментарите, ЗАПАЗВАЙКИ низовете (пътища като `https://…` не са коментар).
 *
 * Без това тестът чете ПРОЗА. Доказано с мутация: махнах самия `paymentLog.create`, а
 * тестът остана зелен — регексът се хващаше за думите „paymentLog.create" в обяснителния
 * коментар точно над него. Коментар, който описва поправката, не е поправката.
 */
function stripComments(src) {
  let out = "", i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += src[i++];
      while (i < src.length) {
        out += src[i];
        if (src[i] === "\\") { out += src[++i] ?? ""; i++; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    out += src[i++];
  }
  return out;
}

const stripeRoute = stripComments(readFileSync(join(BACKEND, "src", "routes", "stripe.js"), "utf8"));

/** Тялото на `case "invoice.paid"` — до следващия `case`. */
function invoicePaidBlock() {
  const start = stripeRoute.indexOf('case "invoice.paid":');
  expect(start).toBeGreaterThan(-1);
  const next = stripeRoute.indexOf("case \"", start + 20);
  return stripeRoute.slice(start, next > 0 ? next : undefined);
}

/**
 * Тялото на `runOnce(async (tx) => { … })` в agency клона, изрязано по БАЛАНС НА СКОБИ.
 *
 * Първата версия сравняваше индекса на `paymentLog.create` с индекса на първия `break;`
 * след `const agency =`. Това мина, докато main не добави пазач („абонаментът вече не е
 * активен → break") ПРЕДИ транзакцията: тестът се хвана за чуждия `break` и падна, без
 * да е счупено нищо. Позиционно сравнение върху текст мери РАЗПОЛОЖЕНИЕ, а истинското
 * изискване е ПРИНАДЛЕЖНОСТ — записът да е вътре в същата идемпотентна транзакция.
 *
 * Броенето на скоби е коректно само върху източник БЕЗ коментари — затова `stripeRoute`
 * минава през `stripComments` при зареждане.
 */
function agencyRunOnceBody() {
  const block = invoicePaidBlock();
  const agencyIdx = block.indexOf("const agency = await prisma.agency.findFirst");
  expect(agencyIdx).toBeGreaterThan(-1);
  const runOnceIdx = block.indexOf("runOnce(", agencyIdx);
  expect(runOnceIdx).toBeGreaterThan(-1);
  const open = block.indexOf("{", block.indexOf("=>", runOnceIdx));
  let depth = 0;
  for (let i = open; i < block.length; i++) {
    if (block[i] === "{") depth++;
    else if (block[i] === "}" && --depth === 0) return block.slice(open, i + 1);
  }
  throw new Error("незатворено тяло на runOnce в agency клона");
}

describe("самият помощник (иначе тестовете под него не значат нищо)", () => {
  it("маха коментарите, но НЕ реже низовете", () => {
    expect(stripComments('a; // paymentLog.create\nb;')).toBe("a; \nb;");
    expect(stripComments('const u = "https://x/y"; /* c */ z;')).toBe('const u = "https://x/y";  z;');
    expect(stripComments("`a // не коментар`;")).toBe("`a // не коментар`;");
  });
});

describe("agency приходите влизат във финансовия регистър", () => {
  it("записът е ВЪТРЕ в идемпотентната транзакция на agency клона", () => {
    expect(agencyRunOnceBody()).toMatch(/paymentLog\.create/);
  });

  it("записът е за агенцията (agencyId), не за сървър", () => {
    const seg = agencyRunOnceBody();
    expect(seg).toMatch(/agencyId:\s*agency\.id/);
    expect(seg).toMatch(/description:\s*"Agency subscription payment"/);
  });

  it("сумата идва от фактурата (сървърна, цели центове) — никога от клиента", () => {
    const seg = agencyRunOnceBody();
    expect(seg).toMatch(/amount:\s*invoice\.amount_paid/);
    expect(seg).not.toMatch(/parseFloat|Number\(req\.|req\.body/);
  });

  it("идемпотентност: фактурата е ключът, не броячът", () => {
    expect(agencyRunOnceBody()).toMatch(/stripeInvoiceId:\s*invoice\.id/);
    const model = schema.slice(schema.indexOf("model PaymentLog"), schema.indexOf("model PaymentLog") + 900);
    expect(model).toMatch(/stripeInvoiceId\s+String\?\s+@unique/);
  });

  it("схемата допуска и двата вида ред, с индекс по агенция", () => {
    const model = schema.slice(schema.indexOf("model PaymentLog"), schema.indexOf("model PaymentLog") + 900);
    expect(model).toMatch(/serverId\s+String\?/);
    expect(model).toMatch(/agencyId\s+String\?/);
    expect(model).toMatch(/@@index\(\[agencyId\]\)/);
    // main добави индекс по сървър при v43 (schema drift zero) — сливането пази и двата.
    expect(model).toMatch(/@@index\(\[serverId\]\)/);
  });
});

describe("афилиейт програмата е махната — не се връща през тази поправка", () => {
  it("stripe.js няма нито едно афилиейт обръщение", () => {
    expect(stripeRoute).not.toMatch(/affiliate/i);
  });

  it("схемата няма афилиейт модели", () => {
    expect(schema).not.toMatch(/model\s+Affiliate/);
  });
});
