// bot/src/__tests__/commandAuthz.test.js
// Команда, която кара БОТА да публикува съдържание, не е отворена за всеки.
//
// ДЕФЕКТЪТ (одит етап 5, 12.08.2026): `/poll` нямаше НИКАКВА авторизация —
// само cooldown от 10 секунди. Тоест всеки член можеше да накара бота да
// публикува текст по свой избор; съобщението излиза с авторитета на бота, не
// на човека.
//
// Същата функция имаше ТРИ пътя и само този беше отворен:
//   • таблото (`POST /:serverId/polls`) → requireServerAdmin
//   • сестринската `/giveaway`          → ManageGuild
//   • `/poll`                            → нищо
// Пак класът „едно правило, N определения", който този продукт е срещал
// многократно. Затова тестът гейтва ПРАВИЛОТО, не отделната команда.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CMDS = join(dirname(fileURLToPath(import.meta.url)), "..", "commands");

function commands() {
  return readdirSync(CMDS)
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({ name: f.replace(".js", ""), src: readFileSync(join(CMDS, f), "utf8") }));
}

/** Носи ли командата някакъв гард — платформен по подразбиране или рунтайм? */
function isGuarded(src) {
  return /setDefaultMemberPermissions\(/.test(src)
    || /isStaffMember\(/.test(src)
    || /permissions\.has\(/.test(src)
    || /globalRole|MAIN_OWNER/.test(src);
}

describe("авторизация на командите", () => {
  // Командите, които публикуват съдържание от името на бота в канал.
  // Нарочно е СПИСЪК, а не евристика: тестът трябва да се проваля шумно,
  // когато някой добави четвърта такава команда, вместо тихо да я подмине.
  const PUBLISHING = ["poll", "giveaway"];

  it.each(PUBLISHING)("/%s изисква права — ботът не публикува по молба на всеки", (name) => {
    const cmd = commands().find((c) => c.name === name);
    expect(cmd, `командата ${name} изчезна — тестът трябва да се обнови, не да мине`).toBeTruthy();
    expect(isGuarded(cmd.src), `/${name} е без гард`).toBe(true);
  });

  it("двете публикуващи команди искат ЕДНО И СЪЩО право", () => {
    const perms = PUBLISHING.map((name) => {
      const src = commands().find((c) => c.name === name).src;
      return (src.match(/setDefaultMemberPermissions\(PermissionFlagsBits\.(\w+)\)/) || [])[1];
    });
    expect(new Set(perms).size, `разминаване в правата: ${perms.join(" vs ")}`).toBe(1);
    expect(perms[0]).toBe("ManageGuild");
  });

  it("нула команди с празен гард по погрешка (никоя не е с undefined право)", () => {
    const bad = commands()
      .filter((c) => /setDefaultMemberPermissions\(\s*\)/.test(c.src))
      .map((c) => c.name);
    expect(bad, `празен setDefaultMemberPermissions: ${bad.join(", ")}`).toEqual([]);
  });
});
