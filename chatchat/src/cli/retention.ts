import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { appendAudit } from '../audit.js';

/**
 * Ретенция (GDPR чл. 5(1)(e), правният одит т. 1) — пуска се дневно (systemd timer / cron):
 *   npm run retention
 * - сесии: изтекли или отнети преди RETENTION_SESSION_DAYS дни (по подразбиране 30) се трият;
 * - случаи: RESOLVED, затворени преди RETENTION_CASE_DAYS дни, се трият със съобщенията,
 *   доказателствата, хронологията, обратната връзка и тикета — САМО ако срокът е зададен
 *   (решение на администратора на данните, не на кода).
 * Одитната верига не се пипа: срокът и псевдонимизацията ѝ са отделно решение (SECURITY.md).
 */

const Env = z.object({
  RETENTION_SESSION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  RETENTION_CASE_DAYS: z
    .union([z.literal(''), z.coerce.number().int().min(30).max(3650)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
});

const DAY = 24 * 3600 * 1000;

async function main(): Promise<void> {
  const env = Env.parse(process.env);
  const db = new PrismaClient();
  try {
    const now = Date.now();
    const sessionCutoff = new Date(now - env.RETENTION_SESSION_DAYS * DAY);
    const sessions = await db.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }],
      },
    });
    let cases = 0;
    if (env.RETENTION_CASE_DAYS !== null) {
      const caseCutoff = new Date(now - env.RETENTION_CASE_DAYS * DAY);
      const result = await db.case.deleteMany({
        where: { status: 'RESOLVED', closedAt: { lt: caseCutoff } },
      });
      cases = result.count;
    }
    await appendAudit(db, {
      tenantId: null,
      actorId: null,
      action: 'retention.run',
      detail: {
        sessions: sessions.count,
        cases,
        sessionDays: env.RETENTION_SESSION_DAYS,
        caseDays: env.RETENTION_CASE_DAYS,
      },
    });
    process.stdout.write(`Ретенция: ${sessions.count} сесии, ${cases} случая изтрити.\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof z.ZodError ? z.prettifyError(err) : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
