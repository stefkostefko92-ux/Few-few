// Одиторска следа в стил СУПТО (Приложение № 29, т. 16–18): само добавяне,
// никога изтриване. Тя е и доказателствената база за материалната
// отговорност на касиера (чл. 207 КТ).

import { prisma } from "./db";

export async function audit(
  userId: string | null,
  action: string,
  entity?: string,
  entityId?: string,
  detail?: unknown
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity: entity ?? null,
      entityId: entityId ?? null,
      detail: detail === undefined ? null : JSON.stringify(detail),
    },
  });
}
