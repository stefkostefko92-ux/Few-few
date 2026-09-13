/**
 * Създава (или обновява паролата на) собственика от средата на сървъра — не от репото.
 *   OWNER_EMAIL=admin@carbonstealth.eu OWNER_NAME="…" OWNER_PASSWORD='…' node dist/scripts/create-owner.js
 * Идемпотентен: съществуващ имейл → нова парола + роля OWNER + активен.
 */
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, passwordPolicyError } from '../auth/password.js';

const input = z
  .object({
    OWNER_EMAIL: z.string().email(),
    OWNER_NAME: z.string().min(2).default('Собственик'),
    OWNER_PASSWORD: z.string().min(1),
  })
  .safeParse(process.env);

if (!input.success) {
  console.error('Нужни са OWNER_EMAIL и OWNER_PASSWORD (по избор OWNER_NAME).');
  process.exit(2);
}

const policyError = passwordPolicyError(input.data.OWNER_PASSWORD);
if (policyError) {
  console.error(policyError);
  process.exit(2);
}

const email = input.data.OWNER_EMAIL.toLowerCase();
const passwordHash = await hashPassword(input.data.OWNER_PASSWORD);
const user = await prisma.user.upsert({
  where: { email },
  create: { email, name: input.data.OWNER_NAME, passwordHash, role: 'OWNER' },
  update: { passwordHash, role: 'OWNER', active: true, failedLogins: 0, lockedUntil: null },
});
await prisma.session.deleteMany({ where: { userId: user.id } });
console.log(
  `Собственик готов: ${user.email} (${user.id}). Влез и включи втори фактор от „Профил“.`,
);
await prisma.$disconnect();
