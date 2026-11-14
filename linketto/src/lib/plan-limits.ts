import 'server-only';
import { prisma } from '@/lib/db';
import { planLimitPatches } from '@/lib/plan-limits-core';

// Лимитите на плана се проверяват при ЗАПИС (profile.ts), но при сваляне
// на плана (отказан абонамент, админ смяна) вече включените платени функции
// трябва да спрат — иначе Pro за един месец е „Pro завинаги“ (одит H2).
// Вика се от webhook-а (subscription.deleted) и от админ смяната на план.
// Не-разрушително: виж plan-limits-core.ts (какво точно се спира).

export async function applyPlanLimits(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!user) return;
  const profiles = await prisma.profile.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, customDomain: true, style: true, published: true },
  });
  // Една транзакция: свалянето на план не бива да остане наполовина.
  await prisma.$transaction(
    planLimitPatches(user.plan, profiles).map(({ id, patch }) =>
      prisma.profile.update({
        where: { id },
        data: {
          customDomain: patch.customDomain,
          published: patch.published,
          style: patch.style as object | undefined,
        },
      }),
    ),
  );
}
