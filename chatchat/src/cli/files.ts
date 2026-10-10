import { loadFilesConfig } from '../config.js';
import { attachmentStoreFrom } from '../storage/factory.js';
import { sweep, sweepProblems, type ExpectedRow, type SweepMode } from '../storage/sweep.js';
import { systemClientFromEnv } from '../db/clients.js';

/**
 * Шифрованите файлове в покой (NFR-03) — поддръжка от сървъра (в контейнера: `node dist/cli/files.js`):
 *   npm run files:status               колко обекта са шифровани (текущ/стар KEK) и колко — не
 *   npm run files:encrypt              старите нешифровани → шифровани (идемпотентно; deploy.sh го
 *                                      пуска след всеки успешен деплой)
 *   npm run files:rekey                след смяна на FILES_KEK (старият — в FILES_KEK_PREVIOUS):
 *                                      DEK на всеки обект се преопакова с новия; тялото не се пипа
 *   npm run files:verify [-- --db] [-- --root DIR]
 *                                      разшифрова ВСИЧКО докрай (всеки tag); с --db сверява и sha256
 *                                      на открития текст с базата; --root — друга папка (пробата за
 *                                      възстановяване на бекъпа, deploy/files-restore.sh)
 * Изход: 0 — наред; 1 — има какво да види човек (броевете в отчета); 2 — грешна употреба/среда.
 * Отчетът е само броеве и ключове на обекти — никога имена или съдържание.
 */

const MODES: readonly SweepMode[] = ['status', 'encrypt', 'rekey', 'verify'];

function isMode(v: string | undefined): v is SweepMode {
  return MODES.some((m) => m === v);
}

function usage(): never {
  process.stderr.write(
    'употреба: files.js (status | encrypt | rekey | verify [--db] [--root ПАПКА])\n',
  );
  process.exit(2);
}

async function expectedRows(): Promise<ExpectedRow[]> {
  // Системната роля (chatchat_system, BYPASSRLS): CLI-то обикаля клиенти или създава клиент.
  const db = systemClientFromEnv();
  try {
    return await db.attachment.findMany({
      select: { objectKey: true, sha256: true, scanStatus: true },
    });
  } finally {
    await db.$disconnect();
  }
}

async function main(): Promise<void> {
  const [mode, ...rest] = process.argv.slice(2);
  if (!isMode(mode)) usage();
  const at = rest.indexOf('--root');
  const root = at >= 0 ? rest[at + 1] : undefined;
  if (at >= 0 && !root) usage();
  if (mode !== 'verify' && (root || rest.includes('--db'))) usage();

  const cfg = loadFilesConfig(root ? { ...process.env, ATTACHMENTS_DIR: root } : process.env);
  if (!cfg.ATTACHMENTS_DIR) {
    process.stderr.write('ATTACHMENTS_DIR липсва — няма хранилище.\n');
    process.exit(2);
  }
  const store = attachmentStoreFrom(cfg);
  if ((mode === 'encrypt' || mode === 'rekey') && !store.crypto.keyring) {
    process.stderr.write('FILES_ENCRYPTION=off — няма с какво да се шифрова.\n');
    process.exit(2);
  }

  const expected = mode === 'verify' && rest.includes('--db') ? await expectedRows() : null;
  const r = await sweep(store, mode, expected);
  const lines = [
    `files ${mode}: ${r.objects} обекта — шифровани с текущия KEK ${r.current}, със стар KEK ${r.previous}, ` +
      `нешифровани ${r.plain}; сменени сега ${r.converted}; пропуснати (изтрити междувременно) ${r.changed}; ` +
      `неуспешни ${r.failed}.`,
  ];
  if (expected) {
    lines.push(
      `Срещу базата: ${r.mismatched} с различен sha256, ${r.missing} липсващи CLEAN файла, ${r.orphans} файла без ред.`,
    );
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  const problems = sweepProblems(r, mode, cfg.FILES_PLAINTEXT);
  if (problems.length > 0) {
    process.stderr.write(`⚠ ${problems.join('; ')}\n`);
    for (const s of r.samples) process.stderr.write(`  ${s}\n`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  // Без съдържание и без тайни: съобщенията на конфигурацията казват само коя настройка.
  process.stderr.write(`files: ${err instanceof Error ? err.message : 'грешка'}\n`);
  process.exitCode = 2;
});
