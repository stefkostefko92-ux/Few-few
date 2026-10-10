import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { appendAudit } from '../audit.js';
import { loadFilesConfig } from '../config.js';
import { runRetention } from '../services/retention.js';
import { attachmentStoreFrom } from '../storage/factory.js';

/**
 * Ретенция (GDPR чл. 5(1)(e), правният одит т. 1) — пуска се дневно (systemd timer / cron):
 *   npm run retention
 * - сесии: изтекли или отнети преди RETENTION_SESSION_DAYS дни (по подразбиране 30) се трият;
 * - случаи: RESOLVED, затворени преди RETENTION_CASE_DAYS дни, се трият със съобщенията,
 *   доказателствата, хронологията, обратната връзка, тикета и прикачените файлове (файловете —
 *   ПРЕДИ реда) — САМО ако срокът е зададен (решение на администратора на данните, не на кода);
 * - прикачени файлове: непривързани (или PDF, който не е станал документ) след 24 ч.;
 *   INFECTED/FAILED редове след 7 дни.
 * Одитната верига не се пипа: срокът и псевдонимизацията ѝ са отделно решение (SECURITY.md).
 */

const Env = z.object({
  RETENTION_SESSION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  RETENTION_CASE_DAYS: z
    .union([z.literal(''), z.coerce.number().int().min(30).max(3650)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
});

async function main(): Promise<void> {
  const env = Env.parse(process.env);
  // ATTACHMENTS_DIR: без него файловете не могат да се изтрият — тогава редовете им също остават
  // (fail-closed). Хранилището е същото като на приложението (шифроване по FILES_*), макар тук само да трие.
  const files = loadFilesConfig(process.env);
  const db = new PrismaClient();
  try {
    const store = files.ATTACHMENTS_DIR ? attachmentStoreFrom(files) : null;
    const report = await runRetention(db, store, {
      sessionDays: env.RETENTION_SESSION_DAYS,
      caseDays: env.RETENTION_CASE_DAYS,
    });
    await appendAudit(db, {
      tenantId: null,
      actorId: null,
      action: 'retention.run',
      detail: {
        ...report,
        sessionDays: env.RETENTION_SESSION_DAYS,
        caseDays: env.RETENTION_CASE_DAYS,
      },
    });
    process.stdout.write(
      `Ретенция: ${report.sessions} сесии, ${report.cases} случая (${report.caseFiles} файла), ` +
        `${report.orphans} несвързани и ${report.quarantined} заразени/непроверени файла изтрити.\n`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof z.ZodError ? z.prettifyError(err) : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
