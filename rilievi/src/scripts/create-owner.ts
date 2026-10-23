import { z } from 'zod';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { writeAudit } from '../audit.js';
import { emailSchema } from '../auth/email.js';
import { hashPassword, passwordProblem } from '../auth/password.js';

/**
 * Първият MASTER — еднократно, от средата на сървъра (DEPLOY.md, т. 4; `deploy/create-master.sh`):
 *   OWNER_EMAIL=… OWNER_NAME=… OWNER_PASSWORD=… npm run owner:create
 * Паролата не се печата; на сървъра стига до контейнера през stdin, не през командния ред.
 * Всички останали влизат САМО с покана от портала.
 */
async function main(): Promise<void> {
  const email = emailSchema.safeParse(process.env.OWNER_EMAIL ?? '');
  const name = z
    .string()
    .trim()
    .min(2)
    .max(120)
    .safeParse(process.env.OWNER_NAME ?? '');
  const password = process.env.OWNER_PASSWORD ?? '';
  if (!email.success || !name.success) throw new Error('Задай OWNER_EMAIL и OWNER_NAME.');
  const problem = passwordProblem(password, [email.data, name.data]);
  if (problem) throw new Error(`Паролата не минава проверката: ${problem}`);
  if ((await prisma.user.count({ where: { master: true } })) > 0) {
    throw new Error('Вече има MASTER — останалите се канят от портала (Utenti → Invita).');
  }
  if (await prisma.user.findUnique({ where: { email: email.data } })) {
    throw new Error('Този имейл вече има акаунт.');
  }
  const user = await prisma.user.create({
    data: {
      email: email.data,
      name: name.data,
      master: true,
      passwordHash: await hashPassword(password),
      mustChangePassword: process.env.OWNER_MUST_CHANGE === '1',
    },
  });
  await writeAudit({
    actorId: null,
    action: 'OWNER_CREATE',
    aziendaId: null,
    targetType: 'user',
    targetId: user.id,
  });
  logger.info('MASTER е създаден — влез в портала, създай фирмите от „Aziende“ и покани хората им');
}

main()
  .catch((error: unknown) => {
    logger.error({ err: errorMessage(error) }, 'MASTER не е създаден');
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
