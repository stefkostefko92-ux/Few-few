// backend/src/__tests__/auditLog.test.js
// Одитният дневник не бива да чупи операцията, която описва.
//
// ДЕФЕКТЪТ (продукция, 11.08.2026): `POST /api/bot/server/register` падаше с
// PrismaClientKnownRequestError. `AuditLog.actorId` има ВЪНШЕН КЛЮЧ към `User`,
// а ботът подава `guild.ownerId` — суров Discord ID. Собственик, който никога
// не е влизал в таблото, НЯМА ред в `User` → нарушение на външния ключ и цялата
// регистрация се проваля.
//
// Асиметрията, която го скри: `Server.ownerId` е обикновен стринг без външен
// ключ (приема дори "UNKNOWN"), а `AuditLog.actorId` е истинска връзка. Едно и
// също Discord ID минава на едното място и пада на другото.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

const { writeAudit } = await import("../lib/auditLog.js");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue(null);
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("writeAudit — външният ключ", () => {
  it("НЕПОЗНАТ Discord актьор отива в actorTag, не в actorId", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);   // никога не е влизал
    const ok = await writeAudit({ actorId: "123456789012345678", action: "BOT_JOINED", serverId: "s1" });

    expect(ok).toBe(true);
    const data = prismaMock.auditLog.create.mock.calls.at(-1)[0].data;
    expect(data.actorId, "непознат актьор НЕ бива да е actorId (външен ключ)").toBeNull();
    expect(data.actorTag).toBe("discord:123456789012345678");   // следата се пази
  });

  it("ПОЗНАТ потребител си остава actorId — връзката е валидна", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1" });
    await writeAudit({ actorId: "u1", action: "TICKET_CLOSED", serverId: "s1" });

    const data = prismaMock.auditLog.create.mock.calls.at(-1)[0].data;
    expect(data.actorId).toBe("u1");
  });

  it("без актьор пише SYSTEM и не търси потребител", async () => {
    await writeAudit({ action: "BOT_LEFT", serverId: "s1" });

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create.mock.calls.at(-1)[0].data.actorTag).toBe("SYSTEM");
  });

  it("подаден actorTag се уважава пред автоматичния", async () => {
    await writeAudit({ actorId: "999", actorTag: "BOT", action: "APPLICATION_APPROVED" });
    expect(prismaMock.auditLog.create.mock.calls.at(-1)[0].data.actorTag).toBe("BOT");
  });
});

describe("writeAudit — дневникът е ВТОРИЧЕН", () => {
  it("провал при запис НЕ хвърля — главната операция оцелява", async () => {
    prismaMock.auditLog.create.mockRejectedValue(
      Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" }),
    );
    await expect(writeAudit({ actorId: "u1", action: "BOT_JOINED" })).resolves.toBe(false);
  });

  it("провал при търсенето на потребител също не хвърля", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("db down"));
    await expect(writeAudit({ actorId: "u1", action: "BOT_JOINED" })).resolves.toBe(false);
  });
});
