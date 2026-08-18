// frontend/src/__tests__/checkout-cta.test.js
// Чл. 8(2) от Директива 2011/83/ЕС: бутонът, който задейства поръчката, трябва
// да е обозначен ЧЕТИМО и НЕДВУСМИСЛЕНО с „поръчка със задължение за плащане"
// или равностойна формулировка. Санкцията НЕ е глоба — потребителят просто НЕ Е
// ОБВЪРЗАН от договора, тоест всяко плащане е оспоримо.
//
// „Upgrade to Premium" не е равностойно: то не казва, че се плаща. Затова
// текстът носи глагола (абонирам/subscribe) + сумата + периода.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const I18N = join(__dirname, "..", "i18n", "dashboard");
// index.js е регистърът на локалите, не локал — иначе гейтът иска ключове от него.
const locales = readdirSync(I18N).filter((f) => f.endsWith(".js") && f !== "index.js");
const page = readFileSync(join(__dirname, "..", "pages", "PremiumPage.jsx"), "utf8");

describe("бутонът за плащане — чл. 8(2)", () => {
  it("checkout бутонът ползва subscribeAndPay, не голото upgradePlan", () => {
    // Режем коментарите — обяснението горе съдържа същите думи.
    const code = page.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("{/*")).join("\n");
    const btn = code.slice(code.indexOf("checkoutMut.mutate()"));
    expect(btn).toContain("premium.subscribeAndPay");
  });

  it("текстът носи И сумата, И периода (не само глагола)", () => {
    expect(page).toMatch(/subscribeAndPay",\s*\{[\s\S]*?price:/);
    expect(page).toMatch(/subscribeAndPay",\s*\{[\s\S]*?period:/);
  });

  it.each(locales)("%s носи трите ключа с {plan} {price} {period}", (file) => {
    const src = readFileSync(join(I18N, file), "utf8");
    const cta = src.match(/"premium\.subscribeAndPay":\s*"([^"]+)"/)?.[1];
    expect(cta, `${file}: липсва premium.subscribeAndPay`).toBeTruthy();
    for (const ph of ["{plan}", "{price}", "{period}"]) {
      expect(cta, `${file}: липсва ${ph}`).toContain(ph);
    }
    expect(src, `${file}: липсва perMonthShort`).toContain('"premium.perMonthShort"');
    expect(src, `${file}: липсва perYearShort`).toContain('"premium.perYearShort"');
  });
});
