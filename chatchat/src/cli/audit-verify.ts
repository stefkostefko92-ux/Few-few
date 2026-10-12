import { setTimeout as sleep } from 'node:timers/promises';
import { verifyAuditChain } from '../audit.js';
import {
  EXIT_BROKEN,
  EXIT_FAILED,
  EXIT_INTACT,
  parseArgs,
  verifyWithConfirmation,
} from './audit-verify-core.js';
import { systemClientFromEnv } from '../db/clients.js';

/**
 * Проверка на одитната верига по график (FR-12, §15.1) — дневно от chatchat-audit-verify.timer
 * (deploy/monitoring/audit-verify.sh → `node dist/cli/audit-verify.js` в контейнера):
 *   npm run audit:verify [-- --confirm-delay-ms 30000]
 * Ползва `verifyAuditChain` — веригата от котвата на последната контролна точка на ретенцията (иначе
 * от GENESIS), всеки хеш наново. Само чете: проверката не пише в одита, който проверява. Счупено
 * звено се потвърждава с втора проверка (audit-verify-core.ts — защо).
 *
 * Изход: 0 — цяла; 2 — счупена (страница ChatchatAuditChainBroken); 1 — проверката не завърши (база,
 * аргументи). В изхода — само броеве и id на звеното, никога съдържание на събитие.
 */

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  // Системната роля (chatchat_system, BYPASSRLS): CLI-то обикаля клиенти или създава клиент.
  const db = systemClientFromEnv();
  try {
    const verdict = await verifyWithConfirmation(
      () => verifyAuditChain(db),
      (ms) => sleep(ms),
      args.confirmDelayMs,
    );
    if (verdict.status === 'broken') {
      process.stderr.write(
        `Одитната верига е СЧУПЕНА при събитие #${verdict.eventId} (потвърдено с втора проверка). ` +
          'Не пипай базата — runbook: ChatchatAuditChainBroken.\n',
      );
      return EXIT_BROKEN;
    }
    const [events, checkpoint] = await Promise.all([
      db.auditEvent.count(),
      db.auditCheckpoint.findFirst({ orderBy: { throughId: 'desc' }, select: { throughId: true } }),
    ]);
    const anchor = checkpoint ? `контролна точка до #${checkpoint.throughId}` : 'GENESIS';
    const note = verdict.transient
      ? ' (първата проверка съвпадна с ретенцията — втората е чиста)'
      : '';
    process.stdout.write(`Одитната верига е цяла: ${events} събития от ${anchor}${note}.\n`);
    return EXIT_INTACT;
  } finally {
    await db.$disconnect();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(
      `Проверката на одитната верига не завърши: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = EXIT_FAILED;
  },
);
