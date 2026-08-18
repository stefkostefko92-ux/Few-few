// bot/src/__tests__/reactionRoles.test.js
// Регресии за Reaction Roles гардовете (находки на Разбивача/Кодаджията, 05.08.2026).
import { describe, it, expect } from "vitest";
import { PermissionsBitField } from "discord.js";
import { emojiKey, isRoleSafeToSelfAssign, roleAssignabilityReason } from "../utils/reactionRoles.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Минимален "role" дубъл, съвместим с това, което гардът чете.
function fakeRole({ permsBits = 0n, managed = false, position = 1 } = {}) {
  return {
    managed,
    permissions: new PermissionsBitField(permsBits),
    comparePositionTo(other) { return position - other.position; },
  };
}
const botMember = { roles: { highest: { position: 10 } } };

describe("isRoleSafeToSelfAssign — privilege-escalation гард (A01)", () => {
  it("позволява обикновена роля без опасни права под ботската", () => {
    expect(isRoleSafeToSelfAssign(fakeRole({ position: 3 }), botMember)).toBe(true);
  });

  it("отказва Administrator", () => {
    const r = fakeRole({ permsBits: PermissionsBitField.Flags.Administrator, position: 3 });
    expect(isRoleSafeToSelfAssign(r, botMember)).toBe(false);
  });

  it("отказва ManageGuild / ManageRoles / BanMembers", () => {
    for (const flag of [
      PermissionsBitField.Flags.ManageGuild,
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.BanMembers,
      PermissionsBitField.Flags.MentionEveryone,
    ]) {
      expect(isRoleSafeToSelfAssign(fakeRole({ permsBits: flag, position: 3 }), botMember)).toBe(false);
    }
  });

  it("отказва managed (интеграционна) роля", () => {
    expect(isRoleSafeToSelfAssign(fakeRole({ managed: true, position: 3 }), botMember)).toBe(false);
  });

  it("отказва роля на или над ботската позиция", () => {
    expect(isRoleSafeToSelfAssign(fakeRole({ position: 10 }), botMember)).toBe(false);
    expect(isRoleSafeToSelfAssign(fakeRole({ position: 11 }), botMember)).toBe(false);
  });

  it("отказва липсваща роля (изтрита след конфигурацията)", () => {
    expect(isRoleSafeToSelfAssign(null, botMember)).toBe(false);
    expect(isRoleSafeToSelfAssign(undefined, botMember)).toBe(false);
  });
});

describe("emojiKey — каноничен ключ unicode/custom", () => {
  it("unicode emoji → самият знак", () => {
    expect(emojiKey({ name: "🎮", id: null })).toBe("🎮");
  });
  it("custom emoji → name:id", () => {
    expect(emojiKey({ name: "pepe", id: "123456789012345678" })).toBe("pepe:123456789012345678");
  });
});

// ─── Autorole ползва СЪЩИЯ гард срещу ескалация (Разбивача, 07.08.2026) ──────
// Reaction Roles имаха гарда от 05.08.2026; autorole беше без него, при това е
// по-опасен: прилага се автоматично на ВСЕКИ влизащ, без негово действие. Админ
// с Manage Server (който сам може да няма Administrator) задаваше autorole към
// администраторска роля и всеки нов член ставаше администратор.
describe("autorole минава през гарда за опасни роли", () => {
  const SRC = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../events/guildMemberAdd.js"),
    "utf-8",
  );

  it("guildMemberAdd внася isRoleSafeToSelfAssign", () => {
    expect(SRC).toContain("isRoleSafeToSelfAssign");
  });

  it("проверката стои ПРЕДИ roles.add, не след него", () => {
    const guard = SRC.indexOf("isRoleSafeToSelfAssign(role");
    const add = SRC.indexOf('member.roles.add(roleId, "Autorole on join")');
    expect(guard).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(add);
  });

  it("отказаната роля оставя следа — иначе конфигурацията мълчи", () => {
    const i = SRC.indexOf("isRoleSafeToSelfAssign(role");
    expect(SRC.slice(i, i + 400)).toMatch(/console\.warn/);
  });
});

// ─── Причината, не само отказът (08.08.2026) ─────────────────────────────────
// Ботът отказваше опасна роля ТИХО, а таблото я предлагаше все едно е наред.
// Сега таблото пита СЪЩАТА функция и показва защо — но само ако функцията
// връща РАЗЛИЧИМИ причини и остава единственият източник на истината.
describe("roleAssignabilityReason — една дефиниция, две употреби", () => {
  it("безопасна роля → null", () => {
    expect(roleAssignabilityReason(fakeRole({ position: 3 }), botMember)).toBeNull();
  });

  it("интеграционна роля → managed", () => {
    expect(roleAssignabilityReason(fakeRole({ managed: true, position: 3 }), botMember)).toBe("managed");
  });

  it("роля с опасно право → dangerous", () => {
    const r = fakeRole({ permsBits: PermissionsBitField.Flags.Administrator, position: 3 });
    expect(roleAssignabilityReason(r, botMember)).toBe("dangerous");
  });

  it("роля над бота → above_bot", () => {
    expect(roleAssignabilityReason(fakeRole({ position: 20 }), botMember)).toBe("above_bot");
  });

  it("липсваща роля не гърми", () => {
    expect(roleAssignabilityReason(null, botMember)).toBe("managed");
  });

  it("старият гард е ОБВИВКА върху новия — не второ мнение", () => {
    const cases = [
      fakeRole({ position: 3 }),
      fakeRole({ managed: true, position: 3 }),
      fakeRole({ permsBits: PermissionsBitField.Flags.BanMembers, position: 3 }),
      fakeRole({ position: 20 }),
    ];
    for (const r of cases) {
      expect(isRoleSafeToSelfAssign(r, botMember)).toBe(roleAssignabilityReason(r, botMember) === null);
    }
  });
});
