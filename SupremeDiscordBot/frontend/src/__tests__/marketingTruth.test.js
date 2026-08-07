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
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LANDING_TRANSLATIONS } from "../i18n/landing.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(SRC, ...p), "utf8");

/** Целият видим текст: лендинг преводи + английските литерали в Login.jsx. */
const ALL_TEXT = JSON.stringify(LANDING_TRANSLATIONS) + read("pages", "Login.jsx");

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

  // ── „Без телеметрия“ при жив Sentry ──────────────────────────────────────
  { claim: "нула телеметрия", contradicts: "PrivacyPage (Sentry — мониторинг на грешки)", patterns: [
    /no\s+telemetry/i,
    /без\s+телеметрия/i,
  ]},
];

describe("нито едно обещание не противоречи на собствените ни документи", () => {
  it.each(FORBIDDEN)("$claim — опровергано от $contradicts", ({ patterns }) => {
    const hits = patterns.filter((re) => re.test(ALL_TEXT)).map(String);
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
