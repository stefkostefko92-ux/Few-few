// backend/src/__tests__/guildChannels.test.js
// Списъкът с канали е ЧУЖДИ данни за всеки друг наемател.
//
// СИГНАЛЪТ (собственикът, 08.08.2026): „нямам опция да избера в коя категория
// да се отварят тикетите". Настройката съществуваше, но искаше снежинка,
// изписана на ръка — Developer Mode → десен бутон → Copy Channel ID. Това не е
// избор, а домашно, и затова функцията изглеждаше липсваща.
//
// Новият маршрут решава това, но въвежда нова повърхност: имената и ID-тата на
// каналите на ЧУЖД Discord сървър. Затова гейтваме и трите неща, които не бива
// да се разхлабят при следваща редакция:
//   1. скоупът идва от `requireServerAdmin`, не от тялото на заявката;
//   2. guildId се взима от ПЪТЯ (вече доказан), не от клиентски вход;
//   3. недостъпен бот НЕ бива да чупи страницата — 503 с маркер, не 500.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(SRC, p), "utf-8");
const code = (p) => read(p).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const servers = code("routes/servers.js");
const handler = servers.slice(servers.indexOf('router.get("/:serverId/directory"'));
const body = handler.slice(0, handler.indexOf("export default"));

describe("GET /api/servers/:serverId/directory", () => {
  it("минава през requireServerAdmin — иначе е списък с чужди канали", () => {
    expect(handler.slice(0, 200)).toContain("requireServerAdmin");
  });

  it("guildId идва от ПЪТЯ, не от тялото или заявката", () => {
    expect(body).toContain("req.params.serverId");
    expect(body, "guildId от клиента заобикаля гарда").not.toMatch(/req\.body|req\.query/);
  });

  it("недостъпен бот дава 503, не 500 — таблото пада на ръчно ID", () => {
    expect(body).toMatch(/503/);
    expect(body).toMatch(/404/);
  });

  it("вика бота със споделената тайна", () => {
    expect(body).toMatch(/x-bot-secret/);
    expect(body).toMatch(/API_SECRET/);
  });
});

describe("ботът връща само каквото таблото ползва", () => {
  const bot = code("../../bot/src/index.js");
  const route = bot.slice(bot.indexOf('app.get("/internal/guild/:guildId/directory"'));
  const fn = route.slice(0, route.indexOf('app.post("/internal/application-discuss"'));

  it("маршрутът съществува и е зад изискването за тайна", () => {
    expect(fn.length, "маршрутът липсва — таблото няма откъде да вземе каналите").toBeGreaterThan(100);
    // `app.use(requireBotSecret)` стои НАД него във файла — доказваме реда.
    expect(bot.indexOf("app.use(requireBotSecret)"))
      .toBeLessThan(bot.indexOf('app.get("/internal/guild/:guildId/directory"'));
  });

  it("не изнася съобщения, списък членове или теми на канали", () => {
    // `roles.cache` НЕ е в списъка: тя е легитимният резервен път на
    // `roles.fetch()`. Списъкът пази изхода да не порасне до неща, които
    // таблото не рисува — съдържание, хора, описания на канали.
    for (const leak of ["messages", "members.fetch", "topic", "presence"]) {
      expect(fn, `изнася ${leak} — това е чужд сървър`).not.toContain(leak);
    }
  });

  it("ролите излизат с ФЛАГ, не със сурови права", () => {
    // Битовата маска на правата е повече, отколкото таблото рисува, и е точна
    // карта на защитите на чуждия сървър. Излиза само изводът.
    expect(fn).toMatch(/assignable/);
    expect(fn, "не изнасяй permissions bitfield").not.toMatch(/permissions:\s*role\.permissions/);
    expect(fn).not.toMatch(/permissions\.bitfield/);
  });

  it("причината идва от СЪЩАТА функция, с която ботът отказва роля", () => {
    // Иначе таблото има второ мнение и предлага роля, която ботът тихо отказва.
    expect(fn).toMatch(/roleAssignabilityReason/);
  });

  it("@everyone не се предлага за раздаване", () => {
    expect(fn).toMatch(/role\.id === guild\.id/);
  });

  it("казва дали ботът може да пише/създава — предупреждението е ПРЕДИ избора", () => {
    expect(fn).toMatch(/canSend/);
    expect(fn).toMatch(/canCreate/);
  });

  it("чете на живо, не само от кеша (нов канал трябва да се вижда веднага)", () => {
    expect(fn).toMatch(/channels\.fetch\(\)/);
  });
});

describe("клиентът е fail-open", () => {
  const sel = readFileSync(join(SRC, "..", "..", "frontend", "src", "components", "DiscordPicker.jsx"), "utf-8");

  it("падне ли ботът, полето става текстово — настройката остава достъпна", () => {
    expect(sel).toMatch(/isError/);
    expect(sel).toMatch(/<input/);
    expect(sel).toMatch(/picker\.botUnreachable/);
  });

  it("запазена стойност за непознат канал не се губи мълчаливо", () => {
    expect(sel).toMatch(/picker\.unknownKept/);
  });
});
