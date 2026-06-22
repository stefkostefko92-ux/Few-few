import { prisma } from "@/lib/prisma";

// Записва действие в одит лога. Никога не хвърля грешка — одитът не бива да
// проваля основното действие.
export async function audit(opts: {
  userEmail: string;
  action: string; // CREATE | UPDATE | DELETE | PUBLISH | RESOLVE | LOGIN
  entity: string;
  entityId?: string;
  summary: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userEmail: opts.userEmail,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId,
        summary: opts.summary,
      },
    });
  } catch {
    /* без значение — продължаваме */
  }
}
