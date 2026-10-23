// bot/src/__tests__/commandsCatalog.test.js
// Пази каталога вярно описан (/setup wizard+sync, /form review) и синхронизиран
// байт-по-байт с копието на backend-а — двата се разминаваха мълчаливо преди.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { COMMAND_CATALOG, getAllCommands } from "../utils/commandsCatalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("COMMAND_CATALOG", () => {
  it("describes /setup wizard and /setup sync (not the old bare /setup)", () => {
    const names = getAllCommands().map((c) => c.name);
    expect(names).toContain("/setup wizard");
    expect(names).toContain("/setup sync");
    expect(names).not.toContain("/setup");
  });

  it("describes /form spawn and /form review", () => {
    const names = getAllCommands().map((c) => c.name);
    expect(names).toContain("/form spawn");
    expect(names).toContain("/form review");
  });

  it("stays byte-identical with the backend's copy (single source of truth)", () => {
    const botFile = readFileSync(path.join(__dirname, "../utils/commandsCatalog.js"), "utf8");
    const backendFile = readFileSync(
      path.join(__dirname, "../../../backend/src/data/commandsCatalog.js"),
      "utf8"
    );
    expect(botFile).toBe(backendFile);
    // Третото копие (frontend) дрейфна мълчаливо, защото гейтът пазеше само
    // двете горе — Commands страницата показваше каталог без Reaction Roles.
    const frontendFile = readFileSync(
      path.join(__dirname, "../../../frontend/src/data/commandsCatalog.js"),
      "utf8",
    );
    expect(botFile).toBe(frontendFile);
  });
});


// ─── Каталогът не лъже за командите (одит 09.08.2026) ────────────────────────
// /premium custombot и /premium export СЪЩЕСТВУВАХА (bot/src/commands/
// premium.js), но каталогът ги премълчаваше → /help и Commands страницата
// показваха продукт с 2 функции по-малко. /panel обещаваше "/panel <name>",
// а реалната команда изисква subcommand spawn.
import { COMMAND_CATALOG, getAllCommands } from "../utils/commandsCatalog.js";

describe("каталог ↔ реалните команди", () => {
  const all = getAllCommands();
  it("документира подкомандите на /premium", () => {
    expect(all.some((c) => c.name === "/premium custombot")).toBe(true);
    expect(all.some((c) => c.name === "/premium export")).toBe(true);
  });
  it("/panel сигнатурата носи задължителния subcommand", () => {
    const panel = all.find((c) => c.name === "/panel");
    expect(panel.signature).toContain("spawn");
  });
});

// ─── „Dashboard: …“ казва истината (23.10.2026) ──────────────────────────────
// Проверено срещу таблото: нямаше бутон „New“ за тикет, нито „Add/Remove Member“,
// „unclaim“, „rename“, „Escalate“, раздел „diagnostics“ или „Test“ за webhook;
// плащането отдавна не е през Stripe, а White-label е отделен план.
describe("COMMAND_CATALOG — твърденията за таблото", () => {
  const claims = COMMAND_CATALOG.flatMap((cat) => [
    ...(cat.commands || []).map((c) => ({ who: c.name, text: c.dashboard })),
    ...(cat.dashboardOnly || []).map((f) => ({ who: f.feature, text: `${f.description} ${f.dashboard}` })),
  ]);
  it("не обещава действия, които таблото няма", () => {
    const FALSE = [/click 'New'/, /Add Member/, /Remove Member/, /\bunclaim\b/i, /rename action/, /\bEscalate\b/, /diagnostics/i, /\/ Test\b/, /Stripe/, /shield icon/];
    const bad = claims.flatMap(({ who, text }) => FALSE.filter((re) => re.test(text)).map((re) => `${who}: ${re}`));
    expect(bad).toEqual([]);
  });
  it("White-label е свой план, не част от Premium", () => {
    const wl = COMMAND_CATALOG.flatMap((c) => c.dashboardOnly || []).find((f) => /White-label bot/.test(f.feature));
    expect(wl.feature).toMatch(/White-label plan/);
    expect(wl.description).not.toMatch(/Requires Premium/);
  });
});

describe("COMMAND_CATALOG — готовите отговори имат страница в таблото", () => {
  it("/tag add, remove и list сочат страницата, не „само Discord“", () => {
    const tags = getAllCommands().filter((c) => ["/tag add", "/tag remove", "/tag list"].includes(c.name));
    expect(tags).toHaveLength(3);
    for (const c of tags) expect(c.dashboard, c.name).toMatch(/^Canned replies page/);
  });
});
