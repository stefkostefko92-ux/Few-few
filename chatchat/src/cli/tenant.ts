import { PrismaClient, type AccountKind, type Role } from '@prisma/client';
import { z } from 'zod';
import { appendAudit } from '../audit.js';
import { hashPassword, PASSWORD_MIN_LENGTH } from '../auth/password.js';

/**
 * Начално създаване без UI (на сървъра, от средата — паролата не минава през историята на shell-а):
 *   npm run tenant:create   — клиент + първи потребител (TENANT_SLUG, TENANT_NAME, USER_*)
 *   npm run user:create     — нов потребител в съществуващ клиент (TENANT_SLUG, USER_*)
 * Пълната директория с потребители в UI (FR-22) е следваща стъпка.
 */

const ROLES = [
  'PORTAL_TECHNICIAN',
  'INTERNAL_TECHNICIAN',
  'SUPPORT',
  'ENGINEERING',
  'KNOWLEDGE_OWNER',
  'TENANT_ADMIN',
  'PLATFORM_ADMIN',
] as const satisfies readonly Role[];

const UserEnv = z.object({
  TENANT_SLUG: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/),
  USER_EMAIL: z.string().trim().toLowerCase().email(),
  USER_NAME: z.string().trim().min(2).max(120),
  USER_PASSWORD: z.string().min(PASSWORD_MIN_LENGTH).max(256),
  USER_ROLE: z.enum(ROLES),
  USER_LOCALE: z.enum(['it', 'en', 'bg']).default('it'),
  USER_COMPANY: z.string().trim().min(1).max(120).optional(),
});

async function createUser(db: PrismaClient, tenantId: string, env: z.infer<typeof UserEnv>) {
  const kind: AccountKind = env.USER_ROLE === 'PORTAL_TECHNICIAN' ? 'PORTAL' : 'INTERNAL';
  if (kind === 'PORTAL' && !env.USER_COMPANY) {
    throw new Error('Порталният акаунт иска USER_COMPANY (фирмата, чиито табла вижда).');
  }
  let companyId: string | null = null;
  if (env.USER_COMPANY) {
    const company = await db.company.upsert({
      where: { tenantId_name: { tenantId, name: env.USER_COMPANY } },
      create: { tenantId, name: env.USER_COMPANY },
      update: {},
    });
    companyId = company.id;
  }
  const user = await db.user.create({
    data: {
      tenantId,
      companyId,
      email: env.USER_EMAIL,
      name: env.USER_NAME,
      role: env.USER_ROLE,
      kind,
      locale: env.USER_LOCALE,
      passwordHash: await hashPassword(env.USER_PASSWORD),
    },
  });
  await appendAudit(db, {
    tenantId,
    actorId: null,
    action: 'user.create.cli',
    objectType: 'user',
    objectId: user.id,
    detail: { role: user.role, kind: user.kind },
  });
  return user;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const db = new PrismaClient();
  try {
    if (command === 'tenant') {
      const env = UserEnv.extend({ TENANT_NAME: z.string().trim().min(2).max(120) }).parse(
        process.env,
      );
      const tenant = await db.tenant.create({
        data: { slug: env.TENANT_SLUG, name: env.TENANT_NAME },
      });
      const user = await createUser(db, tenant.id, env);
      process.stdout.write(
        `Клиент ${tenant.slug} и потребител ${user.id} (${user.role}) — създадени.\n`,
      );
    } else if (command === 'user') {
      const env = UserEnv.parse(process.env);
      const tenant = await db.tenant.findUnique({ where: { slug: env.TENANT_SLUG } });
      if (!tenant) throw new Error(`Няма клиент „${env.TENANT_SLUG}“.`);
      const user = await createUser(db, tenant.id, env);
      process.stdout.write(`Потребител ${user.id} (${user.role}) — създаден.\n`);
    } else {
      throw new Error('Употреба: node dist/cli/tenant.js tenant|user (параметрите — от средата)');
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof z.ZodError ? z.prettifyError(err) : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
