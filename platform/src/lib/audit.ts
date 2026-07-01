import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

type AuditInput = {
  action:
    | "LOGIN"
    | "LOGIN_FAILED"
    | "CREATE"
    | "UPDATE"
    | "DELETE"
    | "CHECK"
    | "DEPLOY"
    | "SYNC";
  entity: string;
  entityId?: string | null;
  summary: string;
};

// Записва кой какво е направил. Никога не хвърля нагоре — одитът не бива
// да чупи основното действие.
export async function logAudit(
  user: Pick<SessionUser, "id" | "email"> | null,
  input: AuditInput,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: user?.id ?? null,
        userEmail: user?.email ?? "system",
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary,
      },
    });
  } catch (err) {
    console.error("Грешка при запис в одит лога:", err);
  }
}
