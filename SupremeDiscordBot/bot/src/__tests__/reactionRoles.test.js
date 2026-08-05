// bot/src/__tests__/reactionRoles.test.js
// Регресии за Reaction Roles гардовете (находки на Разбивача/Кодаджията, 05.08.2026).
import { describe, it, expect } from "vitest";
import { PermissionsBitField } from "discord.js";
import { emojiKey, isRoleSafeToSelfAssign } from "../utils/reactionRoles.js";

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
