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
  });
});
