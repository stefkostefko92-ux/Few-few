// backend/src/__tests__/htmlRoutesCsp.test.js
// Всеки маршрут, който сервира HTML, слага СВОЙ CSP.
//
// ЗАЩО (одит етап 10, 12.08.2026): helmet е конфигуриран с
// `contentSecurityPolicy: false` и обосновката гласеше „API-то не сервира
// HTML". Това НЕ е вярно — архивните транскрипти се сервират точно оттук и
// съдържат потребителско съдържание с лични данни.
//
// Днес е безопасно, защото двете врати слагат свой, по-строг CSP. Но
// защитата е per-route: нов HTML маршрут БЕЗ собствени заглавия не получава
// нищо по подразбиране. Коментар не спира това — гейт спира.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = join(SRC, "routes");

/** Файлове, които връщат HTML тяло. */
function htmlServingFiles() {
  return readdirSync(ROUTES)
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({ name: f, src: readFileSync(join(ROUTES, f), "utf8") }))
    .filter(({ src }) => /text\/html/.test(src));
}

describe("HTML маршрутите носят собствен CSP", () => {
  it("намира вратите, които сервират HTML (иначе тестът е сляп)", () => {
    const names = htmlServingFiles().map((f) => f.name).sort();
    expect(names).toEqual(["archive.js", "tickets.js"]);
  });

  it("всяка слага Content-Security-Policy", () => {
    const bad = htmlServingFiles()
      .filter(({ src }) => !/Content-Security-Policy/.test(src))
      .map((f) => f.name);
    expect(bad, `HTML без CSP: ${bad.join(", ")}`).toEqual([]);
  });

  it("CSP-то забранява скриптове — транскриптът е потребителско съдържание", () => {
    for (const { name, src } of htmlServingFiles()) {
      const csps = [...src.matchAll(/"(default-src[^"]*)"/g)].map((m) => m[1]);
      expect(csps.length, `${name}: не намерих CSP низ`).toBeGreaterThan(0);
      for (const csp of csps) {
        expect(csp, `${name}: CSP пуска скриптове`).toMatch(/script-src 'none'|default-src 'none'/);
      }
    }
  });

  it("всяка HTML врата слага Referrer-Policy: no-referrer — токенът е в URL-а", () => {
    // ДЕФЕКТЪТ (одит по сигурност, 08.09.2026): `archive.js` го имаше,
    // `tickets.js` — не. Транскриптът съдържа външни линкове (прикачени файлове,
    // адреси в съобщения); клик по тях праща `Referer` с `?t=<токен>` към чужд
    // сървър, тоест тайната, която пази личните данни, изтича към третата
    // страна, чийто линк някой е пуснал в тикета. CSP не спира това — Referer
    // не е скрипт. Правилото е едно за всички HTML врати, не per-route.
    const bad = htmlServingFiles()
      .filter(({ src }) => !/Referrer-Policy["']\s*,\s*["']no-referrer["']/.test(src))
      .map((f) => f.name);
    expect(bad, `HTML без no-referrer: ${bad.join(", ")}`).toEqual([]);
  });

  it("глобалният helmet CSP остава изключен СЪЗНАТЕЛНО и обяснено", () => {
    const idx = readFileSync(join(SRC, "index.js"), "utf8");
    expect(idx).toMatch(/contentSecurityPolicy:\s*false/);
    // Обосновката трябва да НАЗОВАВА per-route защитата, за да не подведе
    // следващия човек, че HTML изобщо не се сервира.
    expect(idx).toMatch(/архивн|archive/i);
  });
});
