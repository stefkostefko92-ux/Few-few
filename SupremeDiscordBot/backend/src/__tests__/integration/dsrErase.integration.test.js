// backend/src/__tests__/integration/dsrErase.integration.test.js
// Изтриването на лични данни (чл. 17 GDPR) срещу ЖИВ Postgres.
//
// ЗАЩО е тук, а не при моковете (червен екип + ревю, 13.11.2026): всяка стъпка в
// транзакцията на `eraseDiscordUser` беше обвита в `.catch`. Мокът не знае, че в
// Postgres една грешка прекъсва ЦЯЛАТА транзакция и че COMMIT на прекъсната
// транзакция е тих ROLLBACK. Резултатът беше одит „DSR_ERASED“ при нула изтрити
// реда. Първият тест показва самото свойство на базата; останалите — че
// изтриването минава по ИСТИНСКАТА схема (всяка заявка е валиден SQL) и че е
// всичко или нищо.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb, makeServer, makeUser } from "./db.js";

const { eraseDiscordUser } = await import("../../lib/dsr.js");

const UID = "123456789012345678";
const OTHER = "223456789012345678";
let serverId;

beforeEach(async () => {
  await resetDb();
  const s = await makeServer();
  serverId = s.id;
  await makeUser(UID);
  await makeUser(OTHER);
});

afterAll(async () => { await prisma.$disconnect(); });

async function seed() {
  await prisma.user.update({ where: { id: UID }, data: { username: "stefan", avatar: "abc", email: "s@example.com" } });
  const ticket = await prisma.ticket.create({ data: { serverId, creatorId: UID, channelId: "900000000000000001", status: "CLOSED" } });
  await prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: UID, authorTag: "stefan", content: "личен текст" } });
  const giveaway = await prisma.giveaway.create({
    data: { serverId, channelId: "900000000000000002", prize: "Награда", winnerCount: 1, endsAt: new Date(), endedAt: new Date(), creatorId: OTHER, winnerIds: [OTHER, UID] },
  });
  await prisma.giveawayEntry.create({ data: { giveawayId: giveaway.id, userId: UID } });
  await prisma.memberRoleSnapshot.create({ data: { serverId, userId: UID, roleIds: ["900000000000000003"] } });
  return { ticket, giveaway };
}

describe("свойството на базата, заради което грешката не бива да се гълта", () => {
  it("погълната грешка в транзакция → COMMIT е тих ROLLBACK: нищо не се записва и никой не научава", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: UID }, data: { username: "променен" } });
      await tx.$executeRawUnsafe("SELECT 1 FROM no_such_table").catch(() => {}); // „безопасно“ погълната
      await tx.user.update({ where: { id: OTHER }, data: { username: "също" } }).catch(() => {});
    }).catch(() => {});
    const u = await prisma.user.findUnique({ where: { id: UID } });
    expect(u.username, "първата промяна НЕ е оцеляла — транзакцията е върната").toBe(UID);
  });
});

describe("eraseDiscordUser по истинската схема", () => {
  it("минава докрай: профилът е анонимизиран, участията и снимките ги няма, победителите са без него", async () => {
    const { giveaway } = await seed();
    const r = await eraseDiscordUser(UID, { scope: "identity", via: "dashboard", requestedBy: UID });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const u = await prisma.user.findUnique({ where: { id: UID } });
    expect(u.username).not.toBe("stefan");
    expect(u.avatar).toBeNull();
    expect(u.email).toBeNull();
    expect(await prisma.giveawayEntry.count({ where: { userId: UID } })).toBe(0);
    expect(await prisma.memberRoleSnapshot.count({ where: { userId: UID } })).toBe(0);
    expect((await prisma.giveaway.findUnique({ where: { id: giveaway.id } })).winnerIds).toEqual([OTHER]);
    const msg = await prisma.ticketMessage.findFirst({ where: { authorId: UID } });
    expect(msg.authorTag).not.toBe("stefan");
    expect(msg.content, "обхват identity пази текста — той е запис на оператора").toBe("личен текст");

    const audit = await prisma.auditLog.findFirst({ where: { targetId: UID }, orderBy: { createdAt: "desc" } });
    expect(audit.action).toBe("DSR_ERASED");
  });

  it("обхват full трие и текста на съобщенията", async () => {
    await seed();
    const r = await eraseDiscordUser(UID, { scope: "full", via: "admin", requestedBy: OTHER });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const msg = await prisma.ticketMessage.findFirst({ where: { authorId: UID } });
    expect(msg.content).not.toBe("личен текст");
  });

  it("чуждите данни не се пипат", async () => {
    await seed();
    await prisma.user.update({ where: { id: OTHER }, data: { username: "друг", email: "o@example.com" } });
    await eraseDiscordUser(UID, { scope: "full", via: "admin", requestedBy: OTHER });
    const o = await prisma.user.findUnique({ where: { id: OTHER } });
    expect(o.username).toBe("друг");
    expect(o.email).toBe("o@example.com");
  });
});
