// bot/src/__tests__/commandsCatalogL10n.test.js
// /help на 8 езика (23.10.2026). Три неща, които тихо се чупят:
//   1) речниците в бота се разминават с тези в таблото (едни и същи файлове);
//   2) по-дългият превод пробива лимитите на Discord — embed над 6000 знака
//      или поле над 1024 и Discord отказва целия отговор: /help просто не работи;
//   3) /help остава на английски въпреки езика на човека.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMAND_CATALOG } from "../utils/commandsCatalog.js";
import { catalogFor, CATALOG_DICTS } from "../utils/commandsCatalogL10n/index.js";
import help, { buildCategoryEmbed, buildOverviewEmbed, buildSelect } from "../commands/help.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const LANGS = ["en", ...Object.keys(CATALOG_DICTS)];

// Правилото на Discord: сборът от title, description, имената и стойностите на
// полетата, footer и author в embed-а ≤ 6000.
function embedChars(e) {
  return (e.title || "").length + (e.description || "").length + (e.footer?.text || "").length + (e.author?.name || "").length
    + (e.fields || []).reduce((n, f) => n + f.name.length + f.value.length, 0);
}
function assertEmbed(e, label) {
  expect(embedChars(e), `${label}: общо`).toBeLessThanOrEqual(6000);
  expect((e.fields || []).length, `${label}: полета`).toBeLessThanOrEqual(25);
  expect((e.title || "").length, `${label}: заглавие`).toBeLessThanOrEqual(256);
  expect((e.description || "").length, `${label}: описание`).toBeLessThanOrEqual(4096);
  for (const f of e.fields || []) {
    expect(f.name.length, `${label}: име на поле`).toBeLessThanOrEqual(256);
    expect(f.value.length, `${label}: „${f.name}“`).toBeLessThanOrEqual(1024);
  }
}

describe("речниците са същите като в таблото", () => {
  for (const f of ["bg", "de", "es", "fr", "it", "nl", "pl", "localize"]) {
    it(`${f}.js — байт по байт`, () => {
      const bot = readFileSync(join(HERE, "../utils/commandsCatalogL10n", `${f}.js`), "utf8");
      const web = readFileSync(join(HERE, "../../../frontend/src/i18n/commandsCatalog", `${f}.js`), "utf8");
      expect(bot).toBe(web);
    });
  }
});

describe("/help в лимитите на Discord на всеки език", () => {
  for (const lang of LANGS) {
    it(`${lang}: всяка категория, обзорът и менюто`, () => {
      const catalog = catalogFor(lang);
      expect(catalog).toHaveLength(COMMAND_CATALOG.length);
      for (const cat of catalog) assertEmbed(buildCategoryEmbed(cat, lang).toJSON(), `${lang}/${cat.key}`);
      assertEmbed(buildOverviewEmbed(catalog, lang).toJSON(), `${lang}/обзор`);
      const menu = buildSelect(catalog, lang, catalog[0].key).toJSON().components[0];
      expect(menu.options.length).toBeLessThanOrEqual(25);
      expect(menu.placeholder.length).toBeLessThanOrEqual(150);
      for (const o of menu.options) {
        expect(o.label.length).toBeLessThanOrEqual(100);
        expect(o.description.length).toBeLessThanOrEqual(100);
      }
    });
  }

  it("стойностите в менюто и в изборите остават английските имена (по тях се търси)", () => {
    const menu = buildSelect(catalogFor("bg"), "bg").toJSON().components[0];
    expect(menu.options.map((o) => o.value)).toEqual(COMMAND_CATALOG.map((c) => c.category));
    const choices = help.data.toJSON().options[0].choices;
    expect(choices.map((c) => c.value)).toEqual(COMMAND_CATALOG.map((c) => c.category));
    for (const c of choices) {
      expect(Object.keys(c.name_localizations).sort()).toEqual(["bg", "de", "es-ES", "fr", "it", "nl", "pl"]);
      for (const v of Object.values(c.name_localizations)) expect(v.length).toBeLessThanOrEqual(100);
    }
  });
});

describe("/help отговаря на езика на човека", () => {
  const run = async (locale, category = null) => {
    const reply = vi.fn();
    await help.execute({ locale, guildId: null, options: { getString: () => category }, reply });
    return reply.mock.calls[0][0];
  };

  it("клиент на български → обзорът е на български", async () => {
    const r = await run("bg");
    const e = r.embeds[0].toJSON();
    expect(e.title).toBe("📖 Справочник с команди");
    expect(e.fields.map((f) => f.name)).toContain("🎫 Тикети");
  });

  it("клиент на немски, категория по английския ключ → полетата са на немски", async () => {
    const r = await run("de", "Tickets");
    const e = r.embeds[0].toJSON();
    expect(e.title).toBe("🎫 Tickets");
    expect(e.fields.find((f) => f.name === "/ticket add").value).toContain("Fügt einen Nutzer");
  });

  it("непознат език → английски, без промяна", async () => {
    const r = await run("ja");
    expect(r.embeds[0].toJSON().title).toBe("📖 Command Reference");
  });
});
