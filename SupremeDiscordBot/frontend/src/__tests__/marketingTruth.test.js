// frontend/src/__tests__/marketingTruth.test.js
// Маркетингът не бива да обещава онова, което собствените ни документи отричат.
//
// Този клас ни удари ТРИ пъти:
//  1) лендингът обещаваше SLA, който EULA изрично отхвърля;
//  2) „данните ви не напускат ЕС“ на 8 езика — а Политиката за поверителност
//     §5-6 изброява Discord, Google и Sentry като получатели в САЩ;
//  3) „нищо не се трие при сваляне на плана“ — а `premium.js` връща
//     `archiveRetentionDays` на 30 и метлата трие архивите над 30 дни.
//
// Всяко от тях е подвеждаща търговска практика (UCPD чл. 6 / ЗЗП чл. 68г) и
// нито едно не гърми: кодът е верен, тестовете зелени, лъже само текстът.
// Затова гейтът е върху ТЕКСТА, и то на всички локали наведнъж — тези низове
// се пишат по осем пъти и една забравена локала е достатъчна.
//
// Правилото за писане на тест тук: забранявай ТВЪРДЕНИЕТО, не думата. „ЕС“ е
// напълно легитимна дума (хостингът наистина е в ЕС); забранено е само
// абсолютното отрицание на трансфери.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LANDING_TRANSLATIONS } from "../i18n/landing.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(SRC, ...p), "utf8");

/**
 * Целият текст, който стига до потребител ИЛИ до машина.
 *
 * `index.html` влезе тук след пропуск (одит, кръг 2): гейтът пазеше преводите и
 * Login.jsx, а същите твърдения („priority support“, „EU data sovereignty“)
 * живееха и в JSON-LD блока — тоест поправихме видимия текст, а структурираните
 * данни продължаваха да казват старото на Google и на AI двигателите.
 * Структурирани данни, които противоречат на видимата страница, са и SEO риск,
 * и същата подвеждаща практика. Гейт, който гледа две от три места, не е гейт.
 */
// Визуален одит 25.09.2026: FeaturePage.jsx (13 feature страници) още казваше
// „Nothing is deleted when a subscription ends.“ — гейтът не го четеше. Сега чете
// всяка публична маркетинг страница и данните ѝ, не списък по памет.
// StatusPage е изключена нарочно: „All systems operational“ там е етикетът на
// ЖИВО измерване (забранено е само статичното твърдение).
const MARKETING = readdirSync(join(SRC, "pages"))
  .filter((f) => /^(Feature|Compare|.*Guide|Landing|Commands).*\.jsx$/.test(f))
  .map((f) => read("pages", f));
const MARKETING_DATA = existsSync(join(SRC, "data"))
  ? readdirSync(join(SRC, "data")).filter((f) => /\.(js|jsx|json)$/.test(f)).map((f) => read("data", f))
  : [];

const ALL_TEXT = [
  JSON.stringify(LANDING_TRANSLATIONS),
  read("pages", "Login.jsx"),
  readFileSync(join(SRC, "..", "index.html"), "utf8"),   // JSON-LD + мета
  ...MARKETING,
  ...MARKETING_DATA,
  // Статичният HTML за търсачките — там също седеше „nothing is deleted“.
  readFileSync(join(SRC, "..", "scripts", "prerender.mjs"), "utf8"),
  // Текстът за AI двигателите (25.09.2026).
  readFileSync(join(SRC, "..", "public", "llms.txt"), "utf8"),
].join("\n");

// Таблото НЕ е маркетинг (там „Agency 5“ е легитимен етикет за заварени
// клиенти), но описва плановете на 8 езика — затова само избрани твърдения
// (`alsoDashboard`) се проверяват и в него.
const DASHBOARD_TEXT = readdirSync(join(SRC, "i18n", "dashboard"))
  .filter((f) => f.endsWith(".js")).map((f) => read("i18n", "dashboard", f)).join("\n");

const FORBIDDEN = [
  // ── Абсолютно отрицание на трансфери извън ЕС ────────────────────────────
  { claim: "нула трансфери извън ЕС", contradicts: "PrivacyPage §5-6 (Discord · Google · Sentry, САЩ)", patterns: [
    /не напускат\s+(?:Съюза|ЕС)/i,
    /без\s+трансфери\s+извън/i,
    /never\s+leaves?\s+the\s+EU/i,
    /no\s+transfers?\s+outside/i,
    /verlassen\s+die\s+Union\s+nicht/i,
    /keine\s+Übertragungen\s+außerhalb/i,
    /no\s+salen\s+de\s+la\s+Unión/i,
    /sin\s+transferencias\s+fuera/i,
    /ne\s+quittent\s+jamais\s+l'Union/i,
    /aucun\s+transfert\s+hors/i,
    /non\s+lasciano\s+mai\s+l'Unione/i,
    /nessun\s+trasferimento\s+fuori/i,
    /verlaat\s+de\s+Unie\s+nooit/i,
    /geen\s+doorgifte\s+buiten/i,
    /nigdy\s+nie\s+opuszczają\s+Unii/i,
    /bez\s+transferów\s+poza/i,
  ]},

  // ── „Нищо не се трие при сваляне“ ────────────────────────────────────────
  { claim: "нула изтриване при сваляне на плана", contradicts: "EULA §7.5 + premium.js:400 + scheduler.js (архиви >30 дни)", patterns: [
    /Nothing\s+is\s+deleted/i,
    /данните\s+ви\s+остават\s+достъпни/i,
    /alle\s+Daten\s+bleiben\s+zugänglich/i,
    /tus\s+datos\s+siguen\s+accesibles/i,
    /vos\s+données\s+restent\s+accessibles/i,
    /i\s+tuoi\s+dati\s+restano\s+accessibili/i,
    /je\s+data\s+blijft\s+toegankelijk/i,
    /dane\s+pozostają\s+dostępne/i,
  ]},

  // ── Обещан приоритет/SLA, който EULA §12.3 отрича ────────────────────────
  { claim: "приоритетна поддръжка / гарантиран SLA", contradicts: "EULA §12.3 („best-effort, not guaranteed“)", patterns: [
    /priority\s+(?:responses?|support)/i,
    /guaranteed\s+response/i,
    /приоритетн[а-я]*\s+поддръжка/i,
  ]},

  // ── Планове, които не се продават (одит 24.09.2026) ─────────────────────
  // От 12.09.2026 продажбите са САМО през Discord: месечно, Premium и
  // White-label, без годишни, без Agency, без пробен период (CLAUDE.md, billing.js).
  // Лендингът и JSON-LD още рекламираха €49/€99 годишно и Agency 5/10.
  { claim: "годишен план / Agency / пробен период / Stripe абонамент", contradicts: "lib/billing.js (Discord-only, monthly) + docs/DISCORD_MONETIZATION.md", patterns: [
    /€\s?\d+(?:[.,]\d+)?\s*\/\s*(?:yr|year)\b/i,
    /\d+\s*EUR\s*\/\s*year/i,
    /Agency\s*(?:5|10)\b/,
    /\b14-day\s+free\s+trial\b/i,
    /Stripe\s+subscriptions/i,
  ]},

  // ── Отказ „от таблото“ — отказът е в Discord (Discord е продавачът) ──────
  { claim: "отказ от таблото", contradicts: "docs/DISCORD_MONETIZATION.md (Discord → User Settings → Subscriptions)", patterns: [
    /Cancel\s+anytime\s+from\s+the\s+dashboard/i,
    /Откажете\s+се\s+по\s+всяко\s+време\s+от\s+таблото/i,
    /Jederzeit\s+im\s+Dashboard\s+kündbar/i,
    /Cancela\s+cuando\s+quieras\s+desde\s+el\s+panel/i,
    /Annulez\s+à\s+tout\s+moment\s+depuis\s+le\s+tableau/i,
    /Annulla\s+in\s+qualsiasi\s+momento\s+dalla\s+dashboard/i,
    /Zeg\s+op\s+elk\s+moment\s+op\s+via\s+het\s+dashboard/i,
    /Anuluj\s+w\s+dowolnym\s+momencie\s+z\s+panelu/i,
  ]},

  // ── Цени на чужди ботове, които не сме сверили (одит 24–25.09.2026) ───────
  // „€5–20/month for 8 bots“ и списъкът с цени на конкуренти бяха недоказуеми;
  // сверените сравнения живеят в /compare/* със източник и дата.
  { claim: "непроверени цени на чужди ботове", contradicts: "/compare/* (сверени източници)", patterns: [
    /€\s?5\s*[–-]\s*20/, /5\s*[–-]\s*20\s*€/, /5\s*à\s*20\s*€/, /Webhook\.io/, /Stickyboard/,
  ]},

  // ── AI „с човек в процеса“, а ботът публикува сам (25.09.2026) ────────────
  // backend/src/routes/bot.js праща AI_REPLY → ботът публикува отговора
  // автоматично (с етикет по AI Act чл. 50). Решение на собственика: текстът
  // казва истината навсякъде, вместо да обещава преглед от човек.
  { claim: "AI отговорите минават през преглед от човек", contradicts: "backend/src/routes/bot.js (AI_REPLY → автоматично публикуване)", alsoDashboard: true, patterns: [
    /human[- ]in[- ]the[- ]loop/i,
    /staff (?:member )?reviews?,? (?:edits )?(?:and )?sends?/i,
    /AI never replies on its own/i,
    /reviewed by staff/i,
    /човек в процеса/i,
    /Mensch(?:en)? im Prozess/i,
    /supervisión humana/i,
    /humain dans la boucle/i,
    /intervention humaine/i,
    /persona nel processo/i,
    /supervisione umana/i,
    /mens in de lus/i,
    /człowiekiem w procesie/i,
    /z udziałem człowieka/i,
  ]},

  // ── Статус „всичко работи“ без измерване ─────────────────────────────────
  { claim: "статично „All systems operational“", contradicts: "/status (живото измерване)", patterns: [
    /All\s+systems\s+operational/i,
  ]},

  // ── „Без телеметрия“ при жив Sentry ──────────────────────────────────────
  { claim: "нула телеметрия", contradicts: "PrivacyPage (Sentry — мониторинг на грешки)", patterns: [
    /no\s+telemetry/i,
    /без\s+телеметрия/i,
  ]},
];

describe("нито едно обещание не противоречи на собствените ни документи", () => {
  it.each(FORBIDDEN)("$claim — опровергано от $contradicts", ({ patterns, alsoDashboard }) => {
    const text = alsoDashboard ? `${ALL_TEXT}\n${DASHBOARD_TEXT}` : ALL_TEXT;
    const hits = patterns.filter((re) => re.test(text)).map(String);
    expect(hits, `върнато подвеждащо твърдение: ${hits.join(", ")}`).toEqual([]);
  });
});

describe("верните формулировки СА налице (не сме изтрили твърдението, а сме го поправили)", () => {
  it("трансферите към САЩ са назовани със своето основание", () => {
    // Ако някой просто изтрие изречението, вместо да каже истината, потребителят
    // пак не научава за трансферите — а чл. 13(1)(е) ОРЗД го изисква.
    expect(ALL_TEXT).toMatch(/Standard Contractual Clauses|Стандартни договорни клаузи/);
  });

  it("изтриването на архивите над 30 дни е казано на всяка локала", () => {
    for (const [loc, t] of Object.entries(LANDING_TRANSLATIONS)) {
      const faq = JSON.stringify(t.faq || []);
      expect(faq, `${loc}: FAQ за отказ не споменава 30-дневното изтриване`).toMatch(/30/);
    }
  });

  it("целта за uptime е обозначена като НЕдоговорна", () => {
    const login = read("pages", "Login.jsx");
    if (/99\.9%/.test(login)) {
      expect(login, "99.9% стои без уговорката, че не е договорен SLA")
        .toMatch(/not a contractual SLA/i);
    }
  });
});

describe("играта Server Season е на всяка начална страница с числата от premium.js (24.09.2026)", () => {
  const premium = readFileSync(join(SRC, "..", "..", "backend", "src", "lib", "premium.js"), "utf8");
  const lim = (block, key) => {
    const b = premium.slice(premium.indexOf(`export const ${block} = {`), premium.indexOf("};", premium.indexOf(`export const ${block} = {`)));
    return Number(b.match(new RegExp(`${key}:\\s*(\\d+)`))[1]);
  };
  it("сравнителният ред на английския лендинг съвпада с лимитите (роли · артикули · куестове)", () => {
    const login = read("pages", "Login.jsx");
    const row = login.match(/label="Server Season game"\s+free="([^"]+)"\s+premium="([^"]+)"/);
    expect(row, "липсва ред Server Season game").toBeTruthy();
    expect(row[1]).toContain(`${lim("BASE_LIMITS", "levelRoles")} level roles`);
    expect(row[1]).toContain(`${lim("BASE_LIMITS", "shopItems")} shop items`);
    expect(row[1]).toContain(`${lim("BASE_LIMITS", "activeQuests")} quest`);
    expect(row[2]).toContain(`${lim("PREMIUM_LIMITS", "levelRoles")} roles`);
    expect(row[2]).toContain(`${lim("PREMIUM_LIMITS", "shopItems")} items`);
    expect(row[2]).toContain(`${lim("PREMIUM_LIMITS", "activeQuests")} quests`);
  });
  it("всяка преведена страница има плочка, секция и ред за играта със същите числа", () => {
    const [bR, bS, bQ] = ["levelRoles", "shopItems", "activeQuests"].map((k) => lim("BASE_LIMITS", k));
    const [pR, pS, pQ] = ["levelRoles", "shopItems", "activeQuests"].map((k) => lim("PREMIUM_LIMITS", k));
    for (const [loc, t] of Object.entries(LANDING_TRANSLATIONS)) {
      expect(t.features.some((f) => f.key === "game"), `${loc}: плочка`).toBe(true);
      expect(t.game?.bullets?.length, `${loc}: секция`).toBeGreaterThanOrEqual(3);
      const row = t.compare.rows.find((r) => /Server.?Season/.test(r[0]));
      expect(row, `${loc}: ред в сравнението`).toBeTruthy();
      const nums = (s) => (s.match(/\d+/g) || []).map(Number);
      expect(nums(row[1]), `${loc}: Free`).toEqual([bR, bS, 1, bQ]);
      expect(nums(row[2]), `${loc}: Premium`).toEqual([pR, pS, pQ]);
    }
  });
  it("отказът е описан като стъпка в Discord на всяка локала", () => {
    for (const [loc, t] of Object.entries(LANDING_TRANSLATIONS)) {
      expect(JSON.stringify(t.faq), `${loc}: FAQ за отказ без Discord`).toMatch(/Discord/);
    }
  });
});
