import { prisma } from "@aso/db";
import { ROLES } from "@aso/shared";
import { HttpError } from "../http.js";
import { notifyAdminAction } from "../integrations/discord.js";

/**
 * Общи помощници за админските рутери (`admin.ts` + `adminCrud.ts`): етикет на
 * актьора, одит запис (AdminAudit + Discord), ранг на роля и 404 грешка.
 */

/** Friendly actor label for the audit trail (display name, else the id). */
export async function resolveActorName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  return u?.displayName ?? userId;
}

/** Record a staff mutation and mirror it to Discord. */
export async function audit(
  actor: { sub: string },
  actorName: string,
  action: string,
  targetId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await prisma.adminAudit.create({
    data: { actorId: actor.sub, actorName, action, targetId, detail: JSON.stringify(detail) },
  });
  notifyAdminAction({
    actor: actorName,
    action,
    target: targetId ?? undefined,
    detail: JSON.stringify(detail),
  });
}

/** Ранг на роля в йерархията (по-голямо = по-високо); непозната роля = -1. */
export const roleRank = (r: string): number => ROLES.indexOf(r as (typeof ROLES)[number]);

/** 404 с общ код `not_found` и четимо съобщение. */
export const notFoundError = (message: string): HttpError => new HttpError(404, "not_found", message);
