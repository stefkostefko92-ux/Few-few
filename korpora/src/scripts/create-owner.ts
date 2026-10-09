import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { hashPassword } from '../auth/password.js';
import { emailSchema, nameSchema, newPasswordProblem } from '../services/auth-common.js';
import { audit, SYSTEM_ACTOR } from '../audit.js';

/**
 * Първият собственик — еднократно, от средата на сървъра:
 *   OWNER_EMAIL=… OWNER_NAME=… OWNER_PASSWORD=… npm run owner:create
 * Паролата не се печата. На сървъра се въвежда скрито и стига до контейнера през stdin, не през
 * командния ред (DEPLOY.md, т. 5) — не остава в историята на шела и не се вижда в `ps`.
 * При първи вход панелът иска включване на втория фактор.
 */
async function main(): Promise<void> {
  const email = emailSchema.safeParse(process.env.OWNER_EMAIL ?? '');
  const name = nameSchema.safeParse(process.env.OWNER_NAME ?? '');
  const password = process.env.OWNER_PASSWORD ?? '';
  if (!email.success || !name.success) throw new Error('Задай OWNER_EMAIL и OWNER_NAME.');
  const problem = await newPasswordProblem(password, [email.data, name.data]);
  if (problem) throw new Error(`Паролата не минава проверката: ${problem}`);
  if ((await prisma.user.count({ where: { role: 'OWNER' } })) > 0)
    throw new Error(
      'Вече има собственик — друг човек получава ролята от него в панела: страницата на акаунта му, „Профил“ (с паролата и кода на собственика).',
    );
  if (await prisma.user.findUnique({ where: { email: email.data } }))
    throw new Error('Този имейл вече има акаунт.');
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      email: email.data,
      name: name.data,
      role: 'OWNER',
      passwordHash: await hashPassword(password),
      emailVerifiedAt: now,
      plan: 'LIFETIME',
      planExpiresAt: null,
    },
  });
  await audit(SYSTEM_ACTOR, {
    action: 'system.owner.created',
    targetType: 'user',
    targetId: user.id,
  });
  logger.info('собственикът е създаден — при първи вход включи втория фактор');
}

main()
  .catch((error: unknown) => {
    logger.error({ err: errorMessage(error) }, 'собственикът не е създаден');
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
