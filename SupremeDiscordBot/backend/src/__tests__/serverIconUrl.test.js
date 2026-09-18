// backend/src/__tests__/serverIconUrl.test.js
// API-то връща АДРЕС за иконката, никога суров хеш.
//
// ДЕФЕКТЪТ (продукция, сигнал от собственика 07.08.2026): иконките на сървърите
// излизаха като счупени квадратчета в герба на командния екран И в списъка
// „Сървъри на този план" в агенцията.
//
// Причината е клас „едно поле, две представи": `GET /api/servers` строеше пълен
// CDN адрес от Discord OAuth отговора, а всичко останало връщаше СУРОВИЯ хеш от
// базата (ботът го записва такъв — `bot/src/utils/api.js` праща `guild.icon`).
// Фронтендът рисува `<img src={server.icon}>` и приемаше адрес навсякъде.
//
// Защо провалът беше невидим: хеш в `src` е ОТНОСИТЕЛЕН адрес, а фронтендът е
// SPA (`try_files … /index.html`) — браузърът получава **200 с index.html**
// вместо картинка. Нито 404, нито грешка в логовете. Същият SPA капан, който
// същия ден счупи и IndexNow.
import { describe, it, expect } from "vitest";
import { guildIconUrl, withIconUrl } from "../lib/discordCdn.js";

const GUILD = "1234567890123456789";
const HASH = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

describe("guildIconUrl", () => {
  it("хеш → пълен CDN адрес (това липсваше)", () => {
    expect(guildIconUrl(GUILD, HASH)).toBe(
      `https://cdn.discordapp.com/icons/${GUILD}/${HASH}.png?size=128`,
    );
  });

  it("анимирана иконка (a_) → .gif, не .png", () => {
    expect(guildIconUrl(GUILD, `a_${HASH}`)).toContain(".gif");
  });

  it("без иконка → null, за да сработи fallback-ът с първата буква", () => {
    expect(guildIconUrl(GUILD, null)).toBeNull();
    expect(guildIconUrl(GUILD, "")).toBeNull();
  });

  it("идемпотентно: готов адрес не се сглобява втори път", () => {
    const url = `https://cdn.discordapp.com/icons/${GUILD}/${HASH}.png?size=128`;
    expect(guildIconUrl(GUILD, url)).toBe(url);
  });

  it("боклук в полето → null, а НЕ сглобен адрес (стойността влиза в URL)", () => {
    for (const bad of ["../../../etc/passwd", "x".repeat(200), "не-хеш", "<script>"]) {
      expect(guildIconUrl(GUILD, bad), `${bad} не бива да строи адрес`).toBeNull();
    }
    expect(guildIconUrl("не-снежинка", HASH)).toBeNull();
  });

  it("никога не връща стойност, която браузърът би сметнал за относителен път", () => {
    const out = guildIconUrl(GUILD, HASH);
    expect(out.startsWith("https://")).toBe(true);
  });

  it("withIconUrl пази останалите полета и сменя само icon", () => {
    const row = { id: GUILD, name: "T19C", icon: HASH, extra: 1 };
    expect(withIconUrl(row)).toEqual({ ...row, icon: guildIconUrl(GUILD, HASH) });
    expect(row.icon, "входът не се мутира").toBe(HASH);
  });
});

describe("нито един маршрут не изнася суров хеш към клиента", () => {
  // Гейт срещу връщането на дефекта: всеки маршрут, който подава `icon` на
  // браузъра, минава през discordCdn. Проверката е върху ИЗХОДА на кода, защото
  // точно разминаването между два маршрута създаде дефекта.
  // Всеки ред тук е ТОЧКАТА, през която icon излиза към браузъра. Проверява се
  // самата функция, не само наличието на import — иначе махането на едно
  // извикване минава незабелязано (точно както се случи между двата маршрута).
  const CHOKE_POINTS = [
    { file: "servers.js",   fn: "function sanitizeServer",   proof: "guildIconUrl(" },
    { file: "admin.js",     fn: "function adminServerView",  proof: "guildIconUrl(" },
    { file: "agency.js",    fn: 'router.get("/mine"',        proof: "withIconUrl(" },
    { file: "v1.js",        fn: 'router.get("/server"',      proof: "withIconUrl(" },
    { file: "publicApi.js", fn: 'api.get("/me"',             proof: "withIconUrl(" },
  ];

  it.each(CHOKE_POINTS)("$file: $fn нормализира иконката", async ({ file, fn, proof }) => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const src = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), "..", "routes", file), "utf8",
    );
    const start = src.indexOf(fn);
    expect(start, `${fn} липсва в ${file} — тестът е остарял`).toBeGreaterThanOrEqual(0);
    // Тялото до края на функцията/handler-а: достатъчно, за да не хване съседен код.
    const body = src.slice(start, start + 2500);
    expect(body, `${file} връща СУРОВ хеш към клиента — иконките ще са счупени`).toContain(proof);
  });

  it("servers.js не строи CDN адреса на ръка втори път", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const routes = join(dirname(fileURLToPath(import.meta.url)), "..", "routes");
    for (const file of ["servers.js", "agency.js", "admin.js", "v1.js", "publicApi.js"]) {
      const src = await readFile(join(routes, file), "utf8");
      expect(src, `${file} дублира сглобяването на адреса — една дефиниция, не две`)
        .not.toMatch(/cdn\.discordapp\.com\/icons/);
    }
  });
});
