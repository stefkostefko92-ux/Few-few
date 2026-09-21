// frontend/src/__tests__/checkout-cta.test.js
// Чл. 8(2) от Директива 2011/83/ЕС: бутонът, който задейства поръчката, трябва
// да е обозначен ЧЕТИМО и НЕДВУСМИСЛЕНО с „поръчка със задължение за плащане".
// Санкцията НЕ е глоба — потребителят просто НЕ Е ОБВЪРЗАН от договора.
//
// v3.3 — плащанията са САМО през Discord (Premium Apps). Поръчката се сключва
// в checkout-а на Discord, който е продавач (препродавач в ЕС) и носи чл. 8(2)
// и чл. 16(а) там. Нашето табло НЕ поръчва нищо: то само отваря витрината.
// Затова гейтът вече пази ОБРАТНОТО правило — в таблото да няма нито един
// бутон, който създава задължение за плащане, без да мине през Discord:
//   • нула checkout повиквания към Stripe/Agency от Premium страницата;
//   • нула отметка за отказ от правото на отказ (тя е в Discord);
//   • CTA към магазина е ЛИНК (href към application-directory), не бутон-поръчка;
//   • преводите казват изрично, че продавачът е Discord (преддоговорна
//     информация — чл. 6(1) Дир. 2011/83).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const I18N = join(__dirname, "..", "i18n", "dashboard");
// index.js е регистърът на локалите, не локал — иначе гейтът иска ключове от него.
const locales = readdirSync(I18N).filter((f) => f.endsWith(".js") && f !== "index.js");
const page = readFileSync(join(__dirname, "..", "pages", "PremiumPage.jsx"), "utf8");
const api = readFileSync(join(__dirname, "..", "api", "index.js"), "utf8");
// Режем коментарите — обяснението горе съдържа същите думи.
const code = page.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("{/*")).join("\n");

describe("таблото не сключва платена поръчка — това е работа на Discord checkout-а", () => {
  it("Premium страницата не вика Stripe/Agency checkout", () => {
    expect(code).not.toMatch(/create-checkout/);
    expect(code).not.toMatch(/createAgencyCheckout/);
    expect(code).not.toMatch(/checkoutMut/);
  });

  it("няма отметка за чл. 16(а) — съгласието се взема от продавача (Discord)", () => {
    expect(code).not.toMatch(/withdrawalConsent/);
    expect(code).not.toMatch(/agencyConsent/);
  });

  it("CTA към магазина е линк към Discord, отваря се в нов таб и е защитен", () => {
    // Линкът идва от /api/billing/config (url на SKU-то или магазина).
    expect(code).toMatch(/href=\{upgradeUrl\}[\s\S]{0,80}target="_blank"[\s\S]{0,40}rel="noopener noreferrer"/);
    expect(code).toContain('t("premium.discord.openStore")');
  });

  it("състоянието се чете от доставчико-неутралния /api/billing, не от /api/stripe/status", () => {
    expect(code).toContain("getBillingStatus(serverId)");
    expect(code).toContain("getBillingConfig");
    expect(api).toMatch(/getBillingStatus\s*=\s*\(sid\)\s*=>\s*api\.get\(`\/billing\/\$\{sid\}`\)/);
  });

  it("порталът на Stripe се показва САМО за заварен абонат", () => {
    // Всяко portalMut.mutate() в страницата е зад stripeLegacy && portalAvailable
    // (или в AgencyManageCard — заварени агенции).
    const main = code.slice(0, code.indexOf("function AgencyManageCard"));
    const uses = main.split("portalMut.mutate()").length - 1;
    expect(uses).toBeGreaterThan(0);
    const guarded = main.split("stripeLegacy && portalAvailable").length - 1;
    expect(guarded, "портал без гард за заварен абонат").toBe(uses);
  });
});

describe("преддоговорна информация — продавачът е Discord, на всеки език", () => {
  it.each(locales)("%s носи ключовете на Discord витрината и казва кой продава", (file) => {
    const src = readFileSync(join(I18N, file), "utf8");
    for (const key of [
      "premium.discord.openStore", "premium.discord.storeHint", "premium.discord.cancelHint",
      "premium.discord.manage", "premium.faq.payQ", "premium.faq.payA", "premium.faq.refundA",
    ]) {
      expect(src, `${file}: липсва ${key}`).toContain(`"${key}"`);
    }
    // Discord е назован в подсказката за витрината и в отговора „как се плаща“.
    for (const key of ["premium.discord.storeHint", "premium.faq.payA", "premium.faq.refundA"]) {
      const val = src.match(new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]+)"`))?.[1] || "";
      expect(val, `${file}: ${key} не споменава Discord`).toMatch(/Discord/);
    }
    // Няма върнати Stripe checkout ключове.
    for (const gone of ['"premium.subscribeAndPay"', '"premium.consent"', '"premium.consentAgency"', '"trial.']) {
      expect(src, `${file}: върнат ключ ${gone}`).not.toContain(gone);
    }
  });
});
