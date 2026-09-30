// Creates the platform administrator (role SUPERADMIN) and its company, once. Idempotent: an existing account is
// left untouched unless ADMIN_RESET=1, which sets the password again.
//   ADMIN_EMAIL, ADMIN_PASSWORD (at least 8 characters), ADMIN_NAME, ADMIN_COMPANY
// A password below the application's rule (12 characters, letters and digits) works once: the first sign-in asks
// for a new one.
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { passwordPolicyOk } from '../src/lib/password-policy';

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@carbonstealth.eu').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const name = process.env.ADMIN_NAME ?? 'Carbon Stealth VCC';
  const companyName = process.env.ADMIN_COMPANY ?? 'Carbon Stealth VCC';
  if (password.length < 8) throw new Error('ADMIN_PASSWORD missing or shorter than 8 characters');
  const mustChangePassword = !passwordPolicyOk(password);
  const prisma = new PrismaClient();
  try {
    const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (process.env.ADMIN_RESET === '1') {
        await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: hash, role: 'SUPERADMIN', active: true, mustChangePassword, tokenVersion: { increment: 1 } } });
        process.stdout.write(`admin password reset: ${email}\n`);
      } else {
        process.stdout.write(`admin exists, unchanged: ${email}\n`);
      }
      return;
    }
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name: companyName } });
      await tx.user.create({ data: { companyId: company.id, email, name, role: 'SUPERADMIN', passwordHash: hash, mustChangePassword } });
    });
    process.stdout.write(`admin created: ${email}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
