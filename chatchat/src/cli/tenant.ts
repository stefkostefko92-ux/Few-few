import type { AccountKind, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { appendAudit } from '../audit.js';
import { hashPassword, PASSWORD_MIN_LENGTH } from '../auth/password.js';
import { kindForRole, ROLES } from '../auth/rbac.js';
import { revokeUserSessions } from '../auth/sessions.js';
import {
  INVITE_TTL_HOURS,
  issuePasswordLink,
  RESET_TTL_HOURS,
  unusablePasswordHash,
} from '../services/users.js';
import { systemClientFromEnv } from '../db/clients.js';

/**
 * Начално създаване и спасяване без UI (на сървъра, от средата):
 *   npm run tenant:create   — клиент + първи потребител (TENANT_SLUG, TENANT_NAME, USER_*)
 *   npm run user:create     — нов потребител в съществуващ клиент (TENANT_SLUG, USER_*)
 *   npm run user:reset      — нов еднократен линк за парола (USER_EMAIL; RESET_MFA=1 нулира и TOTP)
 * Без USER_PASSWORD се печата еднократен линк за задаване (паролата не минава през средата и
 * историята на shell-а); USER_PASSWORD остава за обратна съвместимост. Линкът иска
 * PUBLIC_BASE_URL и SESSION_PEPPER (същите като на приложението).
 */

/** Празна променлива = незададена (docker/systemd често подават „“). */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const UserEnv = z.object({
  TENANT_SLUG: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/),
  USER_EMAIL: z.string().trim().toLowerCase().email(),
  USER_NAME: z.string().trim().min(2).max(120),
  USER_PASSWORD: optional(z.string().min(PASSWORD_MIN_LENGTH).max(256)),
  USER_ROLE: z.enum(ROLES),
  USER_LOCALE: z.enum(['it', 'en']).default('it'),
  USER_COMPANY: optional(z.string().trim().min(1).max(120)),
});

const LinkEnv = z.object({
  PUBLIC_BASE_URL: z.url(),
  SESSION_PEPPER: z.string().min(32, 'SESSION_PEPPER трябва да е поне 32 знака'),
});

const ResetEnv = z.object({
  USER_EMAIL: z.string().trim().toLowerCase().email(),
  RESET_MFA: optional(z.enum(['0', '1'])),
});

/** Създателят на линка в PasswordReset, когато е издаден от сървъра, не от човек в UI. */
const CLI_ACTOR = '@cli';

function linkEnv() {
  const env = LinkEnv.parse(process.env);
  return { origin: new URL(env.PUBLIC_BASE_URL).origin, pepper: env.SESSION_PEPPER };
}

/**
 * Проверките ПРЕДИ всеки запис: портал без фирма или акаунт без парола без PUBLIC_BASE_URL/
 * SESSION_PEPPER (няма как да се издаде линк) не оставят полусъздаден клиент.
 */
function prepareUser(env: z.infer<typeof UserEnv>) {
  if (kindForRole(env.USER_ROLE) === 'PORTAL' && !env.USER_COMPANY) {
    throw new Error('Порталният акаунт иска USER_COMPANY (фирмата, чиито табла вижда).');
  }
  return env.USER_PASSWORD ? null : linkEnv();
}

async function createUser(
  db: PrismaClient,
  tenantId: string,
  env: z.infer<typeof UserEnv>,
  link: ReturnType<typeof linkEnv> | null,
) {
  const kind: AccountKind = kindForRole(env.USER_ROLE);
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
      passwordHash: env.USER_PASSWORD
        ? await hashPassword(env.USER_PASSWORD)
        : await unusablePasswordHash(),
    },
  });
  await appendAudit(db, {
    tenantId,
    actorId: null,
    action: 'user.create.cli',
    objectType: 'user',
    objectId: user.id,
    detail: { role: user.role, kind: user.kind, passwordLink: link !== null },
  });
  const issued = link
    ? await issuePasswordLink(db, {
        ...link,
        userId: user.id,
        createdById: CLI_ACTOR,
        ttlHours: INVITE_TTL_HOURS,
      })
    : null;
  return { user, url: issued?.url ?? null };
}

function printLink(url: string | null, hours: number): void {
  if (!url) return;
  process.stdout.write(
    `Еднократен линк за паролата (важи ${hours} ч, покажи го само на човека):\n${url}\n`,
  );
}

async function resetUser(db: PrismaClient): Promise<void> {
  const env = ResetEnv.parse(process.env);
  const link = linkEnv();
  const user = await db.user.findUnique({ where: { email: env.USER_EMAIL } });
  if (!user) throw new Error('Няма такъв потребител.');
  if (!user.active) throw new Error('Акаунтът е деактивиран — първо го активирай.');
  if (env.RESET_MFA === '1') {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { totpSecretEnc: null, totpEnabledAt: null },
      });
      // Отделен процес: отворените realtime потоци падат при следващата им проверка на сесията.
      await revokeUserSessions(tx, [user.id], 'mfa_reset');
      await appendAudit(tx, {
        tenantId: user.tenantId,
        actorId: null,
        action: 'user.mfa_reset.cli',
        objectType: 'user',
        objectId: user.id,
      });
    });
  }
  const issued = await issuePasswordLink(db, {
    ...link,
    userId: user.id,
    createdById: CLI_ACTOR,
    ttlHours: RESET_TTL_HOURS,
  });
  await appendAudit(db, {
    tenantId: user.tenantId,
    actorId: null,
    action: 'user.reset_link.cli',
    objectType: 'user',
    objectId: user.id,
  });
  process.stdout.write(`Потребител ${user.id}${env.RESET_MFA === '1' ? ' (MFA нулиран)' : ''}.\n`);
  printLink(issued.url, RESET_TTL_HOURS);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  // Системната роля (chatchat_system, BYPASSRLS): CLI-то обикаля клиенти или създава клиент.
  const db = systemClientFromEnv();
  try {
    if (command === 'tenant') {
      const env = UserEnv.extend({ TENANT_NAME: z.string().trim().min(2).max(120) }).parse(
        process.env,
      );
      const link = prepareUser(env);
      const tenant = await db.tenant.create({
        data: { slug: env.TENANT_SLUG, name: env.TENANT_NAME },
      });
      const { user, url } = await createUser(db, tenant.id, env, link);
      process.stdout.write(
        `Клиент ${tenant.slug} и потребител ${user.id} (${user.role}) — създадени.\n`,
      );
      printLink(url, INVITE_TTL_HOURS);
    } else if (command === 'user') {
      const env = UserEnv.parse(process.env);
      const link = prepareUser(env);
      const tenant = await db.tenant.findUnique({ where: { slug: env.TENANT_SLUG } });
      if (!tenant) throw new Error(`Няма клиент „${env.TENANT_SLUG}“.`);
      const { user, url } = await createUser(db, tenant.id, env, link);
      process.stdout.write(`Потребител ${user.id} (${user.role}) — създаден.\n`);
      printLink(url, INVITE_TTL_HOURS);
    } else if (command === 'reset') {
      await resetUser(db);
    } else {
      throw new Error(
        'Употреба: node dist/cli/tenant.js tenant|user|reset (параметрите — от средата)',
      );
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
