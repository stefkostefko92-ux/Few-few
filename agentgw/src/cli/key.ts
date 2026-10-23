import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { loadProfiles } from '../profiles.js';
import { PrismaStore } from '../store/prisma.js';
import { CliError, runKeyCommand } from './commands.js';

// CLI-то иска само базата и pepper-а — не цялата конфигурация (без GCP данни).
const pepper = process.env.KEY_PEPPER ?? '';
if (pepper.length < 32) {
  process.stderr.write('Липсва KEY_PEPPER (поне 32 знака) — зареди средата на сървъра.\n');
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new PrismaClient();
try {
  await runKeyCommand(process.argv.slice(2), {
    store: new PrismaStore(db),
    pepper,
    knownAgents: new Set(loadProfiles(join(root, 'agents')).keys()),
    out: (line) => process.stdout.write(`${line}\n`),
  });
} catch (err) {
  process.stderr.write(`${err instanceof CliError ? err.message : String(err)}\n`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
