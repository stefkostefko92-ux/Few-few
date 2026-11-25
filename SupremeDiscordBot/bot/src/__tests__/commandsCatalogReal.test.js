// bot/src/__tests__/commandsCatalogReal.test.js
// Каталогът на командите ↔ командите, които ботът РЕАЛНО регистрира в Discord.
//
// ЗАЩО (одит на Летописеца, 12.11.2026): `/companion info` и `/premium status`
// съществуваха в бота, но липсваха в каталога — страницата „Команди“, `/help` и
// ръководствата не ги показваха. Досегашните гейтове проверяваха отделни редове на
// ръка. Тук се сверява целият списък в двете посоки, от самите дефиниции
// (`data.toJSON()`), така че нова подкоманда без ред в каталога чупи гейта.
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMAND_CATALOG } from "../utils/commandsCatalog.js";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "commands");
const SUB = 1, GROUP = 2, CHAT_INPUT = 1;

/** Всички пътища „/команда подкоманда“ от дефинициите на slash командите. */
async function realPaths() {
  const out = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".js"))) {
    const mod = (await import(join(DIR, f))).default;
    const def = mod?.data?.toJSON ? mod.data.toJSON() : mod?.data;
    if (!def?.name || (def.type && def.type !== CHAT_INPUT)) continue; // контекстните менюта са отделно
    const subs = (def.options || []).filter((o) => o.type === SUB || o.type === GROUP);
    if (!subs.length) { out.push(`/${def.name}`); continue; }
    for (const o of subs) {
      if (o.type === SUB) out.push(`/${def.name} ${o.name}`);
      else for (const s of (o.options || []).filter((x) => x.type === SUB)) out.push(`/${def.name} ${o.name} ${s.name}`);
    }
  }
  return out.sort();
}

const rows = COMMAND_CATALOG.flatMap((c) => c.commands || []).filter((c) => c.name.startsWith("/"));
// Един ред може да описва няколко подкоманди наведнъж: „/tod truth|dare“ покрива
// „/tod truth“ и „/tod dare“ (сигнатурата започва с името и изброява с „|“).
const covers = (row) => {
  const m = row.signature?.startsWith(`${row.name} `) && row.signature.slice(row.name.length + 1).match(/^([a-z-]+(?:\|[a-z-]+)+)$/);
  return m ? m[1].split("|").map((s) => `${row.name} ${s}`) : [];
};

describe("каталогът описва точно командите на бота", () => {
  it("всяка реална команда има ред в каталога", async () => {
    const covered = new Set(rows.flatMap((r) => [r.name, ...covers(r)]));
    const missing = (await realPaths()).filter((p) => !covered.has(p));
    expect(missing, "съществуват в бота, липсват в utils/commandsCatalog.js").toEqual([]);
  });

  it("каталогът не описва команда, която ботът няма", async () => {
    const real = await realPaths();
    // „/companion pvp on|off“ е ИЗБОР на параметър, не подкоманди — там самото име е реалният път.
    const phantom = rows
      .filter((r) => !real.includes(r.name) && !(covers(r).length && covers(r).every((p) => real.includes(p))))
      .map((r) => r.name);
    expect(phantom, "има ги в каталога, няма ги в bot/src/commands").toEqual([]);
  });

  it("гейтът вижда команди (иначе е сляп)", async () => {
    expect((await realPaths()).length).toBeGreaterThan(40);
  });
});
