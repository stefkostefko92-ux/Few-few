// backend/src/__tests__/archiveDoorsGuarded.test.js
// ВСЯКА врата към транскриптите носи една и съща охрана.
//
// ДЕФЕКТЪТ (одит етап 3, 12.08.2026): транскриптите с лични данни се сервират
// от ДВА публични маршрута — `routes/archive.js` и `routes/tickets.js`
// (`/archives/:ticketId`, монтиран ПРЕДИ `requireAuth`). Защитата срещу
// налучкване на архивни токени беше добавена само на първия. Втората врата
// водеше до същите данни със същия вид тайна, но с по-слаба охрана — тоест
// нападателят просто ползва другия адрес.
//
// Това е класът „едно правило, две определения", който този продукт е срещал
// многократно (обхвати на API ключове, каталог на командите, речник на
// състоянията, представяне на иконите). Затова тук се гейтва КЛАСЪТ: който
// добави трета врата без охрана, вижда червено.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROUTES = join(dirname(fileURLToPath(import.meta.url)), "..", "routes");

/** Файлове, които сервират архивен транскрипт срещу токен. */
function archiveServingFiles() {
  return readdirSync(ROUTES)
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({ name: f, src: readFileSync(join(ROUTES, f), "utf8") }))
    .filter(({ src }) => /archiveTokenMatches\(/.test(src));
}

describe("всяка врата към архива е еднакво охранявана", () => {
  it("намира и ДВЕТЕ известни врати (иначе тестът е сляп)", () => {
    const names = archiveServingFiles().map((f) => f.name).sort();
    // Ако някоя изчезне, тестът трябва да го КАЖЕ, а не тихо да мине.
    expect(names).toEqual(["archive.js", "tickets.js"]);
  });

  it("всяка врата проверява блокировка ПРЕДИ да пипне базата", () => {
    const bad = archiveServingFiles()
      .filter(({ src }) => !/check\(\s*"archive"/.test(src))
      .map((f) => f.name);
    expect(bad, `врата без проверка за блокировка: ${bad.join(", ")}`).toEqual([]);
  });

  it("всяка врата брои ПРОВАЛЕНИТЕ опити", () => {
    const bad = archiveServingFiles()
      .filter(({ src }) => !/recordFailure\(\s*"archive"/.test(src))
      .map((f) => f.name);
    expect(bad, `врата, която не брои провали: ${bad.join(", ")}`).toEqual([]);
  });

  it("всяка врата ЧИСТИ брояча при успех (човешка грешка не се трупа)", () => {
    const bad = archiveServingFiles()
      .filter(({ src }) => !/recordSuccess\(\s*"archive"/.test(src))
      .map((f) => f.name);
    expect(bad, `врата без изчистване при успех: ${bad.join(", ")}`).toEqual([]);
  });

  it("обхватът е ЕДИН и същ — иначе нападателят редува адресите", () => {
    for (const { name, src } of archiveServingFiles()) {
      const scopes = [...src.matchAll(/(?:check|recordFailure|recordSuccess)\(\s*"([^"]+)"/g)]
        .map((m) => m[1]);
      const archiveScopes = scopes.filter((s) => s.startsWith("archive"));
      expect(new Set(archiveScopes), `${name}: обхватите трябва да са един`).toEqual(new Set(["archive"]));
    }
  });
});
