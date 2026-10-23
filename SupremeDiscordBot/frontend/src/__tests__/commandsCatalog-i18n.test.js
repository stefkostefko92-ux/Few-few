// commandsCatalog-i18n.test.js — каталогът на командите на 8 езика (23.10.2026).
//
// Страницата „Команди“ в таблото показваше каталога само на английски, дори в
// български акаунт. Каталогът остава един (бот, /help, API); преводите са
// речници по английските имена. Тук се пази двете неща, които тихо гният:
//   1) паритет — нова команда без превод на някой език;
//   2) вярност — преводът да не изгуби команда, `код`, {променлива}, число или
//      имейл от оригинала (иначе инструкцията става грешна).
import { describe, it, expect } from "vitest";
import { COMMAND_CATALOG } from "../data/commandsCatalog";
import { COMMANDS_L10N, localizeCatalog } from "../i18n/commandsCatalog";

const cats = COMMAND_CATALOG.map((c) => c.category).sort();
const cmds = COMMAND_CATALOG.flatMap((c) => (c.commands || []).map((x) => x.name)).sort();
const feats = COMMAND_CATALOG.flatMap((c) => (c.dashboardOnly || []).map((f) => f.feature)).sort();
const texts = [...new Set(COMMAND_CATALOG.flatMap((c) => [
  ...(c.commands || []).flatMap((x) => [x.dashboard, x.permission]),
  ...(c.dashboardOnly || []).map((f) => f.dashboard),
]))].sort();
const contextMenus = COMMAND_CATALOG.flatMap((c) => c.commands || []).filter((x) => !x.name.startsWith("/")).map((x) => x.name).sort();
const english = Object.fromEntries(COMMAND_CATALOG.flatMap((c) => [
  [`cat:${c.category}`, c.description],
  ...(c.commands || []).map((x) => [`cmd:${x.name}`, x.description]),
  ...(c.dashboardOnly || []).map((f) => [`feat:${f.feature}`, f.description]),
]));

// Какво трябва да оцелее в превода дословно.
function invariants(s) {
  return [
    ...(s.match(/(?<![\w/])\/[a-z][a-z-]*/g) || []),          // /команди
    ...(s.match(/`[^`]+`/g) || []),                         // `код`
    ...(s.match(/\{[\w.]+\}/g) || []),                      // {променливи}
    ...(s.match(/[\w.]+@[\w.]+\.[a-z]{2,}/g) || []),       // имейли
    ...(s.match(/#[a-z][\w-]*/g) || []),                    // #канал
    ...(s.match(/\d+/g) || []),                             // числа
  ];
}

describe("каталогът на командите — 7 превода", () => {
  for (const [loc, load] of Object.entries(COMMANDS_L10N)) {
    describe(loc, () => {
      it("паритет: точно ключовете на каталога, нищо празно", async () => {
        const d = (await load()).default;
        expect(Object.keys(d.categories).sort(), "категории").toEqual(cats);
        expect(Object.keys(d.commands).sort(), "команди").toEqual(cmds);
        expect(Object.keys(d.features).sort(), "функции само в таблото").toEqual(feats);
        expect(Object.keys(d.text).sort(), "пътища и права").toEqual(texts);
        expect(Object.keys(d.signatures).sort(), "контекстни команди").toEqual(contextMenus);
        const all = [
          ...Object.values(d.categories).flat(), ...Object.values(d.commands),
          ...Object.values(d.features).flat(), ...Object.values(d.text), ...Object.values(d.signatures),
        ];
        for (const v of all) expect(typeof v === "string" && v.trim().length > 0, `празно в ${loc}`).toBe(true);
      });

      it("вярност: команди, `код`, {променливи}, числа и имейли оцеляват", async () => {
        const d = (await load()).default;
        const tr = {
          ...Object.fromEntries(Object.entries(d.categories).map(([k, v]) => [`cat:${k}`, v[1]])),
          ...Object.fromEntries(Object.entries(d.commands).map(([k, v]) => [`cmd:${k}`, v])),
          ...Object.fromEntries(Object.entries(d.features).map(([k, v]) => [`feat:${k}`, v[1]])),
        };
        const bad = [];
        for (const [k, en] of Object.entries(english)) {
          for (const inv of invariants(en)) if (!tr[k].includes(inv)) bad.push(`${k}: липсва „${inv}“`);
        }
        expect(bad).toEqual([]);
      });

      it("правата в Discord остават с името, което Discord показва", async () => {
        const d = (await load()).default;
        for (const p of ["Manage Server", "Manage Messages or a support role"]) {
          expect(d.text[p], p).toContain(p.split(" or ")[0]);
        }
      });

      it("преведеният каталог пази английския ключ за филтъра", async () => {
        const d = (await load()).default;
        const out = localizeCatalog(COMMAND_CATALOG, d);
        expect(out.map((c) => c.key).sort()).toEqual(cats);
        expect(out.find((c) => c.key === "Tickets").category).toBe(d.categories.Tickets[0]);
      });
    });
  }

  it("без речник (английски) каталогът остава непроменен", () => {
    const out = localizeCatalog(COMMAND_CATALOG, null);
    expect(out.map(({ key: _k, ...c }) => c)).toEqual(COMMAND_CATALOG.map((c) => ({
      ...c,
      commands: c.commands || [],
      dashboardOnly: c.dashboardOnly || [],
    })));
  });
});
