// frontend/src/__tests__/landing.test.js
// Гейт за landing съдържанието — първите тестове на frontend-а.
//
// Не са писани „за да има тестове“: всеки случай тук е бил реален дефект.
//  1) FEATURE_ICONS беше ПОЗИЦИОНЕН масив; добавихме карта в средата на
//     преводите и всяка следваща получи чуждата икона (верификацията излезе с
//     графика, анкетите с подарък). Оттам ключовете — и тестът, който ги пази.
//  2) При машинна обработка на текста в български превод се промъкна йероглиф.
//  3) Твърдения като „шест бота“ живеят на осем езика и лесно се разсинхронизират.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LANDING_TRANSLATIONS } from "../i18n/landing.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = Object.keys(LANDING_TRANSLATIONS);
const read = (...p) => readFileSync(join(SRC, ...p), "utf8");

describe("landing · преводи", () => {
  it("покрива седемте локализирани езика (en живее в Login.jsx)", () => {
    expect(LOCALES.sort()).toEqual(["bg", "de", "es", "fr", "it", "nl", "pl"]);
  });

  it("всички езици изброяват ЕДНИ И СЪЩИ функции, в един и същи ред", () => {
    const ref = LANDING_TRANSLATIONS.bg.features.map((f) => f.key);
    for (const loc of LOCALES) {
      expect(LANDING_TRANSLATIONS[loc].features.map((f) => f.key), `${loc} се разминава`).toEqual(ref);
    }
  });

  it("всяка функция има ключ, заглавие и смислено описание", () => {
    for (const loc of LOCALES) {
      for (const f of LANDING_TRANSLATIONS[loc].features) {
        expect(f.key, `${loc}: карта без ключ`).toBeTruthy();
        expect(f.title?.trim(), `${loc}/${f.key}: празно заглавие`).toBeTruthy();
        expect(f.desc?.trim().length, `${loc}/${f.key}: описанието е твърде късо`).toBeGreaterThan(20);
      }
    }
  });

  it("никой превод не съдържа повредени знаци (CJK в европейски текст)", () => {
    const bad = [];
    for (const loc of LOCALES) {
      for (const ch of JSON.stringify(LANDING_TRANSLATIONS[loc])) {
        const cp = ch.codePointAt(0);
        if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3040 && cp <= 0x30ff)) bad.push(`${loc}: ${ch}`);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });
});

describe("landing · всяка функция има място (редизайн 25.09.2026)", () => {
  // Старият гейт пазеше иконите по ключ. В новия дизайн функциите живеят в
  // канали (site/Landing.jsx → TOUR_CHANNELS), а играта — в своя секция. Същият
  // риск в нова форма: функция без канал просто изчезва от страницата.
  it("всеки ключ на функция (всички 8 езика) е в точно един канал или е играта", async () => {
    const { TOUR_CHANNELS } = await import("../i18n/siteStrings.js");
    const { LANDING_EN } = await import("../i18n/landingEn.js");
    const placed = TOUR_CHANNELS.flatMap((c) => c.features);
    expect(new Set(placed).size, "ключ в два канала").toBe(placed.length);
    for (const t of [LANDING_EN, ...LOCALES.map((l) => LANDING_TRANSLATIONS[l])]) {
      for (const f of t.features) {
        expect(f.key === "game" || placed.includes(f.key), `${t.locale}: „${f.key}“ няма канал`).toBe(true);
      }
    }
  });
});

describe("landing · маркетингови твърдения", () => {
  // Броят заместени ботове се появява в заглавието, надзаглавието и
  // подзаглавието на ВСЕКИ език. Разминат ли се, сайтът си противоречи.
  const EIGHT = /осем|acht|ocho|huit|otto|osiem|\b8\b/i;

  it("твърдението „един бот вместо N“ е едно и също на всички езици", () => {
    for (const loc of LOCALES) {
      const t = LANDING_TRANSLATIONS[loc];
      expect(t.eyebrow, `${loc}: eyebrow`).toMatch(EIGHT);
      expect(t.h1a, `${loc}: заглавие`).toMatch(EIGHT);
      expect(t.featuresSub, `${loc}: подзаглавие`).toMatch(EIGHT);
    }
  });

  it("английската версия казва същото (осем, не шест)", async () => {
    const { LANDING_EN } = await import("../i18n/landingEn.js");
    expect(LANDING_EN.h1a).toBe("Eight bots. Eight bills.");
    expect(LANDING_EN.featuresSub).toMatch(EIGHT);
    expect(JSON.stringify(LANDING_EN)).not.toMatch(/\bsix bots\b/i);
  });

  it("демото в hero-то показва ИСТИНСКИТЕ текстове на бота (редизайн 25.09.2026)", async () => {
    // Етикетът на AI отговора е изискване по AI Act чл. 50 — сайтът показва
    // точно това, което членът ще види; сменят ли го в бота, гейтът пада.
    const { SITE_STRINGS } = await import("../i18n/siteStrings.js");
    const BOT = join(SRC, "..", "..", "bot", "src");
    for (const [loc, st] of Object.entries(SITE_STRINGS)) {
      const bot = readFileSync(join(BOT, "i18n", `${loc}.js`), "utf8");
      for (const k of ["author", "title", "footer"]) {
        const m = bot.match(new RegExp(`"ai\\.disclosure\\.${k}":\\s*"([^"]*)"`));
        expect(m, `${loc}: ботът няма ai.disclosure.${k}`).toBeTruthy();
        expect(st.demo.ai[k], `${loc}: ai.disclosure.${k}`).toBe(m[1]);
      }
    }
    const ix = readFileSync(join(BOT, "events", "interactionCreate.js"), "utf8");
    for (const label of ["Close", "Claim", "Transcript"]) expect(ix).toContain(`.setLabel("${label}")`);
    const demo = read("site", "DiscordReplay.jsx");
    for (const shown of ["🔒 Close", "👋 Claim", "📜 Transcript", "Ticket #0142"]) expect(demo).toContain(shown);
  });
});

// ─── Цените в FAQ съвпадат с ЦЕНОРАЗПИСА, на всеки локал ────────────────────
// Реална издънка (07.08.2026): холандското FAQ обявяваше White-label за
// „€ 19,99/maand of € 199/jaar“, докато таблицата на СЪЩАТА страница казваше
// €9,99/€99 — 19,99/199 са цените на Agency 5. Шест локала бяха верни, един не.
//
// ВНИМАНИЕ при писането на такъв гейт: първата версия проверяваше само дали
// сумата СЪЩЕСТВУВА някъде в ценоразписа — и мутацията мина, защото €19,99 е
// напълно валидна цена (на Agency 5). Гейт, който не може да падне, е нула.
// Затова правилото е по БЛИЗОСТ: всяка сума принадлежи на НАЙ-БЛИЗКОТО име на
// план преди нея. Това е тясна евристика, не общо NLP — и точно тя лови дефекта.
describe("landing FAQ — нула цени, разминати с ценоразписа", () => {
  it("всяка цена в FAQ принадлежи на най-близкия споменат план", () => {
    const MONEY = /€\s?(\d+(?:[.,]\d{2})?)/g;
    const norm = (v) => String(v).replace(/[€\s]/g, "").replace(",", ".");

    const problems = [];
    for (const [loc, pack] of Object.entries(LANDING_TRANSLATIONS)) {
      const tiers = pack?.tiers;
      const faq = pack?.faq;
      if (!tiers || !Array.isArray(faq)) continue;

      // Име на план → неговите законни суми.
      const byName = [];
      for (const tier of Object.values(tiers)) {
        if (!tier?.name) continue;
        const allowed = new Set(["0"]);
        for (const k of ["price", "priceYearly"]) if (tier[k]) allowed.add(norm(tier[k]));
        byName.push({ name: tier.name, allowed });
      }

      for (const { q, a } of faq) {
        const text = `${q} ${a}`;
        for (const m of text.matchAll(MONEY)) {
          const value = norm(m[1]);
          // Най-близкото име на план ПРЕДИ тази сума.
          let nearest = null;
          let nearestAt = -1;
          for (const tier of byName) {
            const at = text.lastIndexOf(tier.name, m.index);
            if (at !== -1 && at > nearestAt) { nearestAt = at; nearest = tier; }
          }
          if (!nearest) continue; // сума без споменат план — не съдим
          if (!nearest.allowed.has(value)) {
            problems.push(
              `${loc}: „${nearest.name}“ е обявен с €${m[1]}, а реалните му цени са ${[...nearest.allowed].filter((x) => x !== "0").join(" / ")}`,
            );
          }
        }
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
