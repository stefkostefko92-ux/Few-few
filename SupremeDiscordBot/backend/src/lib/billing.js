// backend/src/lib/billing.js
// ЕДИНСТВЕНОТО място, което казва КАК се плаща за Supreme Bot.
//
// РЕШЕНИЕ НА СОБСТВЕНИКА (12.09.2026): плащанията минават САМО през Discord
// (Premium Apps). Причината е и правна: Discord Developer Policy (обновена
// 11.09.2026) изисква от 07.10.2024 всяко приложение с платени функции да ги
// предлага през Premium Apps на цена, не по-висока от която и да е друга
// опция. С един-единствен канал паритетът е тривиално изпълнен, а в ЕС Discord
// е ПРЕПРОДАВАЧ (Monetization Terms, 06.06.2024): той начислява и внася ДДС,
// издава разписките и обработва възстановяванията. Нашата система никога не
// вижда карта, никога не държи Stripe тайна за нови покупки.
//
// КАКВО ПОДДЪРЖА DISCORD (проверено в живата документация, 12.09.2026):
//   • само МЕСЕЧНИ абонаменти и еднократни покупки — няма годишни планове;
//   • guild абонамент = един сървър; user и guild SKU НЕ могат да съжителстват
//     → няма как да се продаде мулти-сървърен Agency пакет;
//   • няма пробни периоди.
// Затова продуктовата стълба е: Free · Premium (месечно) · White-label (месечно).
//
// STRIPE ОСТАВА САМО ЗА ЗАВАРЕНИТЕ АБОНАТИ. Discord изрично казва, че не сме
// длъжни да прекратяваме съществуващи отношения. Webhook-ът продължава да се
// проверява и обработва (отмяна/възстановяване все така сваля достъпа —
// никога не оставяме платен клиент без услуга и никога не удържаме без право),
// но НОВА покупка през Stripe няма: checkout маршрутите връщат 410.
//
// `BILLING_PROVIDER`:
//   discord (по подразбиране) — само Discord за нови покупки; Stripe само legacy
//   stripe                    — старото поведение (Stripe checkout позволен)
//   both                      — и двата пътя за покупка (не е препоръчано)
// Стойността се чете при ВСЯКО повикване, а не при зареждане на модула, за да
// може тест да я смени без да презарежда графа от импорти.

const PROVIDERS = new Set(["discord", "stripe", "both"]);

export function billingProvider() {
  const raw = String(process.env.BILLING_PROVIDER || "discord").trim().toLowerCase();
  return PROVIDERS.has(raw) ? raw : "discord";
}

/** Нова покупка през Stripe е позволена само при stripe/both. */
export function stripePurchasesEnabled() {
  const p = billingProvider();
  return p === "stripe" || p === "both";
}

/** Discord Premium Apps е път за покупка при discord/both. */
export function discordPurchasesEnabled() {
  const p = billingProvider();
  return p === "discord" || p === "both";
}

/**
 * Каталогът, който се ПРОДАВА през Discord. Само месечно — Discord не поддържа
 * годишни абонаменти, а Agency е мулти-сървърен и не се мапва към guild SKU.
 * Цените са ИНФОРМАТИВНИ (за таблото и сайта): реалната цена се избира от
 * фиксираната стълба на Discord в Developer Portal и се показва на купувача в
 * Discord checkout-а с ДДС. Показваме „от", защото локалната валута/ДДС са на
 * Discord.
 */
export const DISCORD_PLANS = Object.freeze({
  premium:    Object.freeze({ label: "Premium",     monthlyEur: "4.99" }),
  whitelabel: Object.freeze({ label: "White-label", monthlyEur: "9.99" }),
});

export function discordSkuFor(plan) {
  const e = process.env;
  if (plan === "premium") return e.DISCORD_SKU_PREMIUM || null;
  if (plan === "whitelabel") return e.DISCORD_SKU_WHITELABEL || null;
  return null;
}

/** ID на Discord приложението — същото като OAuth client id. */
export function discordApplicationId() {
  return process.env.DISCORD_CLIENT_ID || null;
}

/**
 * Официалните адреси на магазина (managing-skus, проверено 12.09.2026):
 *   https://discord.com/application-directory/:appID/store
 *   https://discord.com/application-directory/:appID/store/:skuID
 * В чат се рендерират като карта с бутон за покупка; в браузър водят към
 * Application Directory.
 */
export function discordStoreUrl() {
  const app = discordApplicationId();
  return app ? `https://discord.com/application-directory/${app}/store` : null;
}

export function discordSkuUrl(plan) {
  const app = discordApplicationId();
  const sku = discordSkuFor(plan);
  return app && sku ? `https://discord.com/application-directory/${app}/store/${sku}` : null;
}

/** Липсващи настройки, при които Discord продажбата НЕ може да работи. */
export function missingDiscordBillingConfig() {
  const gaps = [];
  if (!discordApplicationId()) gaps.push("DISCORD_CLIENT_ID");
  if (!discordSkuFor("premium")) gaps.push("DISCORD_SKU_PREMIUM");
  if (!discordSkuFor("whitelabel")) gaps.push("DISCORD_SKU_WHITELABEL");
  return gaps;
}

/**
 * Публичната конфигурация за таблото. Без тайни: SKU id-тата са публични по
 * дефиниция (стоят в URL-а на магазина).
 */
export function billingConfig() {
  return {
    provider: billingProvider(),
    discord: {
      enabled: discordPurchasesEnabled(),
      configured: missingDiscordBillingConfig().length === 0,
      applicationId: discordApplicationId(),
      storeUrl: discordStoreUrl(),
      plans: Object.fromEntries(
        Object.entries(DISCORD_PLANS).map(([plan, cfg]) => [plan, {
          label: cfg.label,
          monthlyEur: cfg.monthlyEur,
          skuId: discordSkuFor(plan),
          url: discordSkuUrl(plan),
        }]),
      ),
    },
    stripe: {
      purchasesEnabled: stripePurchasesEnabled(),
      // Управлението (портал) на ЗАВАРЕН абонамент остава възможно винаги,
      // когато Stripe е конфигуриран — клиент трябва да може да отмени.
      legacyManagement: Boolean(process.env.STRIPE_SECRET_KEY),
    },
  };
}
