// backend/src/lib/auditLog.js
// Един безопасен път за писане в одитния дневник.
//
// ДЕФЕКТЪТ (продукция, 11.08.2026): `POST /api/bot/server/register` падаше с
// PrismaClientKnownRequestError. Причината: `AuditLog.actorId` има ВЪНШЕН КЛЮЧ
// към `User`, а ботът подава `guild.ownerId` — суров Discord ID. Собственик,
// който никога не е влизал в таблото, НЯМА ред в `User` → нарушение на външния
// ключ (P2003) и цялата регистрация се проваля.
//
// Забележи асиметрията, която го скри: `Server.ownerId` е обикновен стринг без
// външен ключ (затова приема дори "UNKNOWN"), а `AuditLog.actorId` е истинска
// връзка. Едно и също Discord ID минава на едното място и пада на другото.
//
// Класът е широк: девет места пишеха одит с Discord ID (затваряне, отваряне,
// изтриване и преименуване на тикет, ревю на кандидатура, entitlements). Всяко
// от тях чупеше СВОЯТА операция заради модератор, който ползва само Discord.
//
// Тук се решават и двата въпроса:
//   1. Непознат актьор → пише се като `actorTag`, а не като `actorId`. Следата
//      се запазва (кой е действал), без да лъжем схемата, че е наш потребител.
//   2. Одитът НИКОГА не проваля операцията. Дневникът е ВТОРИЧЕН: тикетът е
//      затворен, сървърът е регистриран. Ако записът не стане, това е повод за
//      лог, не за 500 към бота. (Същият клас като „едно лошо поле събаря
//      всичко" — вторичен провал не бива да убива главното действие.)
import { prisma } from "./prisma.js";

/**
 * Пише одитен запис, без да хвърля.
 *
 * @param {object} entry - същите полета като `prisma.auditLog.create({ data })`.
 *        `actorId` може да е Discord ID на човек, който не е наш потребител —
 *        тогава автоматично се премества в `actorTag`.
 * @returns {Promise<boolean>} дали записът е успял (за тестове/диагностика).
 */
export async function writeAudit(entry = {}) {
  const { actorId, actorTag, ...rest } = entry;
  try {
    let resolvedId = null;
    let resolvedTag = actorTag;

    if (actorId) {
      // Търсене по първичен ключ — евтино, и се прави само когато има актьор.
      const known = await prisma.user.findUnique({
        where: { id: String(actorId) },
        select: { id: true },
      });
      if (known) {
        resolvedId = String(actorId);
      } else {
        // Пазим КОЙ е действал, без да нарушаваме външния ключ.
        resolvedTag = actorTag || `discord:${actorId}`;
      }
    }

    await prisma.auditLog.create({
      data: {
        ...rest,
        actorId: resolvedId,
        actorTag: resolvedId ? (actorTag ?? null) : (resolvedTag ?? "SYSTEM"),
      },
    });
    return true;
  } catch (err) {
    // Никога не проваляме главната операция заради дневника.
    console.error(`[audit] записът пропадна (${entry.action || "?"}):`, err?.message);
    return false;
  }
}
