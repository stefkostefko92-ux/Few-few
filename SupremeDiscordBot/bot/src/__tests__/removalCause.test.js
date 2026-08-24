// bot/src/__tests__/removalCause.test.js
// Причината за напускане се разпознава с ЕДНА заявка към audit log.
//
// ЗАЩО (одит етап 4, 12.08.2026): „лепкавите роли" трябва да ПРОПУСКАТ снимка
// при kick/ban — иначе изгонен модератор се връща и ботът му връща правата,
// които току-що са отнети. Първата реализация питаше audit log ДВА пъти (по
// веднъж на тип), тоест удвои натиска върху строго лимитиран маршрут при ВСЯКО
// напускане. Четири други handler-а изрично гейтват точно преди такава заявка —
// значи цената ѝ е призната в кода.
//
// Тестът пази и двете: разпознаването да е вярно И заявката да е една.
import { describe, it, expect, vi } from "vitest";
import { AuditLogEvent } from "discord.js";
import { fetchRemovalCause } from "../utils/serverEventLog.js";

const NOW = Date.now();

/** Guild двойник, който брои обръщенията към audit log. */
function guildWith(entries) {
  const fetchAuditLogs = vi.fn().mockResolvedValue({ entries: { find: (fn) => entries.find(fn) } });
  return { guild: { fetchAuditLogs }, fetchAuditLogs };
}

const entry = (action, targetId, ms = 0) => ({
  action,
  target: { id: targetId },
  createdTimestamp: NOW - ms,
  executor: { id: "mod1", username: "Mod", discriminator: "0" },
  reason: "спам",
});

describe("fetchRemovalCause", () => {
  it("разпознава KICK", async () => {
    const { guild } = guildWith([entry(AuditLogEvent.MemberKick, "u1")]);
    const cause = await fetchRemovalCause(guild, "u1");
    expect(cause).toMatchObject({ kind: "kick", executorId: "mod1", reason: "спам" });
  });

  it("разпознава BAN", async () => {
    const { guild } = guildWith([entry(AuditLogEvent.MemberBanAdd, "u1")]);
    expect((await fetchRemovalCause(guild, "u1"))?.kind).toBe("ban");
  });

  it("ЕДНА заявка към audit log, не по една на тип", async () => {
    const { guild, fetchAuditLogs } = guildWith([entry(AuditLogEvent.MemberBanAdd, "u1")]);
    await fetchRemovalCause(guild, "u1");
    expect(fetchAuditLogs).toHaveBeenCalledTimes(1);
    // Без филтър по тип — иначе двете причини не се събират в един отговор.
    expect(fetchAuditLogs.mock.calls[0][0]).not.toHaveProperty("type");
  });

  it("доброволно напускане → null (снимката на ролите се ПАЗИ)", async () => {
    const { guild } = guildWith([]);
    expect(await fetchRemovalCause(guild, "u1")).toBeNull();
  });

  it("чуждо събитие не се брои за наше", async () => {
    const { guild } = guildWith([entry(AuditLogEvent.MemberKick, "друг")]);
    expect(await fetchRemovalCause(guild, "u1")).toBeNull();
  });

  it("СТАР запис не се брои — иначе вчерашен kick блокира днешно напускане", async () => {
    const { guild } = guildWith([entry(AuditLogEvent.MemberKick, "u1", 60_000)]);
    expect(await fetchRemovalCause(guild, "u1", 5000)).toBeNull();
  });

  it("липсващо право ViewAuditLog не хвърля — връща null", async () => {
    const guild = { fetchAuditLogs: vi.fn().mockRejectedValue(new Error("Missing Permissions")) };
    await expect(fetchRemovalCause(guild, "u1")).resolves.toBeNull();
  });
});
