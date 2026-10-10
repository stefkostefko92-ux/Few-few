import { appendAudit } from '../audit.js';
import { loadRetentionConfig } from '../config-retention.js';
import { loadFilesConfig } from '../config.js';
import { runRetention } from '../services/retention.js';
import { attachmentStoreFrom } from '../storage/factory.js';
import { systemClientFromEnv } from '../db/clients.js';

/**
 * Ретенция по класове (GDPR чл. 5(1)(e), NFR-08, NFR-13) — пуска се дневно (systemd timer):
 *   npm run retention
 * Сроковете са в средата (src/config-retention.ts → RETENTION_*), всеки клас отделно:
 * - сесии (RETENTION_SESSION_DAYS, 30); затворени случаи (RETENTION_CASE_DAYS — САМО ако е зададен);
 * - съобщения в директни/групи/канали (RETENTION_DIRECT/GROUP/CHANNEL_DAYS — само ако са зададени;
 *   дискусиите по случай следват случая); файловете им — ПРЕДИ реда;
 * - известия (90), присъствие (7), метаданни: приключени имейли, линкове за парола, следи на
 *   изтрити съобщения (90);
 * - одит (RETENTION_AUDIT_DAYS, 10 г.) — с контролна точка: веригата остава проверима;
 * - непривързани файлове (RETENTION_ORPHAN_HOURS, 24) и INFECTED/FAILED (RETENTION_QUARANTINE_DAYS, 7).
 * Хранилището е същото като на приложението (шифроване по FILES_*), макар тук само да трие; без
 * ATTACHMENTS_DIR файловете не могат да се изтрият — тогава редовете им също остават (fail-closed).
 * В одита и в изхода — само броеве и срокове.
 */

async function main(): Promise<void> {
  const env = loadRetentionConfig();
  const files = loadFilesConfig(process.env);
  // Системната роля (chatchat_system, BYPASSRLS): CLI-то обикаля клиенти или създава клиент.
  const db = systemClientFromEnv();
  try {
    const store = files.ATTACHMENTS_DIR ? attachmentStoreFrom(files) : null;
    const days = {
      sessionDays: env.RETENTION_SESSION_DAYS,
      caseDays: env.RETENTION_CASE_DAYS,
      directDays: env.RETENTION_DIRECT_DAYS,
      groupDays: env.RETENTION_GROUP_DAYS,
      channelDays: env.RETENTION_CHANNEL_DAYS,
      notificationDays: env.RETENTION_NOTIFICATION_DAYS,
      presenceDays: env.RETENTION_PRESENCE_DAYS,
      metadataDays: env.RETENTION_METADATA_DAYS,
      auditDays: env.RETENTION_AUDIT_DAYS,
      orphanHours: env.RETENTION_ORPHAN_HOURS,
      quarantineDays: env.RETENTION_QUARANTINE_DAYS,
    };
    const report = await runRetention(db, store, {
      ...days,
      auditArchiveDir: env.RETENTION_AUDIT_ARCHIVE_DIR || null,
    });
    await appendAudit(db, {
      tenantId: null,
      actorId: null,
      action: 'retention.run',
      detail: { ...(JSON.parse(JSON.stringify(report)) as Record<string, unknown>), ...days },
    });
    const m = report.messages;
    const msg = (x: typeof m.direct) => (x ? `${x.deleted}+${x.tombstoned} следи` : '—');
    process.stdout.write(
      `Ретенция: ${report.sessions} сесии, ${report.cases} случая (${report.caseFiles} файла), ` +
        `съобщения: директни ${msg(m.direct)}, групи ${msg(m.group)}, канали ${msg(m.channel)}; ` +
        `${report.notifications ?? 0} известия, ${report.presence ?? 0} присъствия, ` +
        `метаданни ${JSON.stringify(report.metadata)}, одит ${report.audit?.deleted ?? 0}; ` +
        `${report.orphans} несвързани и ${report.quarantined} заразени/непроверени файла изтрити.\n`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
