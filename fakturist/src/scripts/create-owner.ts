// Първият мастър акаунт и плановете по подразбиране: `npm run owner:create` с OWNER_EMAIL, OWNER_NAME и
// OWNER_PASSWORD в средата (на сървъра — deploy/create-owner.sh). Паролата се сменя при първия вход и
// 2FA е задължителна, преди панелът да се отвори (src/auth/guards.ts).
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { hashPassword, passwordProblem } from '../auth/password.js';
import { seedPlans } from '../billing/seed-plans.js';

const Env = z.object({
  OWNER_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  OWNER_NAME: z.string().trim().min(2).max(100),
  OWNER_PASSWORD: z.string().min(1),
});

async function main(): Promise<void> {
  const env = Env.parse(process.env);
  const problem = passwordProblem(env.OWNER_PASSWORD, [env.OWNER_EMAIL, env.OWNER_NAME]);
  if (problem) throw new Error(`Паролата не минава проверката: ${problem}`);
  const passwordHash = await hashPassword(env.OWNER_PASSWORD);
  await prisma.$transaction(async (tx) => {
    const plans = await seedPlans(tx);
    const existing = await tx.user.findUnique({ where: { email: env.OWNER_EMAIL } });
    if (existing) {
      if (existing.platformRole !== 'MASTER') {
        await tx.user.update({ where: { id: existing.id }, data: { platformRole: 'MASTER' } });
        await audit(tx, {
          actorId: null,
          action: 'master.promoted',
          targetType: 'User',
          targetId: existing.id,
        });
      }
      console.log(`Мастър акаунтът съществува; нови планове: ${plans}`);
      return;
    }
    const user = await tx.user.create({
      data: {
        email: env.OWNER_EMAIL,
        name: env.OWNER_NAME,
        passwordHash,
        platformRole: 'MASTER',
        mustChangePassword: true,
      },
    });
    await audit(tx, {
      actorId: null,
      action: 'master.created',
      targetType: 'User',
      targetId: user.id,
    });
    console.log(`Мастър акаунтът е създаден; нови планове: ${plans}`);
  });
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
