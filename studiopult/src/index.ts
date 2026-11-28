/**
 * Стартът: настройки и ключ (fail closed), Git Bash на Windows, нашите агенти, сървър само на 127.0.0.1.
 * Адресът с еднократния ключ се печата САМО в терминала на собственика (не в лог файл).
 */
import { mkdirSync } from 'node:fs';
import { loadConfig, readKey } from './config.js';
import { createPult } from './server.js';
import { SessionGate } from './http/guard.js';
import { Approvals } from './approvals.js';
import { DailyBudget } from './budget.js';
import { TaskRunner } from './tasks.js';
import { listAgents, sdkRunner } from './agent.js';
import { findBash, selfCheck } from './selfcheck.js';

function main(): void {
  const cfg = loadConfig();
  const key = readKey(cfg.keyFile);
  const bash = findBash();
  if (!bash)
    throw new Error(
      'Няма Git Bash. Инсталирай Git for Windows (winget install Git.Git) — без него пазачите на агентите не работят.',
    );
  mkdirSync(cfg.previewRoot, { recursive: true });
  const gate = new SessionGate();
  const server = createPult({
    repoRoot: cfg.repoRoot,
    previewRoot: cfg.previewRoot,
    gate,
    runner: sdkRunner,
    approvals: new Approvals(),
    budget: new DailyBudget({ file: cfg.spendFile, dailyUsd: cfg.dailyUsd }),
    tasks: new TaskRunner(),
    agents: listAgents(cfg.repoRoot),
    key,
    selfCheck: () => selfCheck(cfg.repoRoot, bash),
  });
  server.listen(cfg.port, '127.0.0.1', () => {
    process.stdout.write(
      `Студио пулт е готов. Отвори (еднократен адрес, само на този компютър):\n  http://127.0.0.1:${cfg.port}/?k=${gate.startToken}\n` +
        `Папка на студиото: ${cfg.previewRoot}\n`,
    );
  });
  // Ctrl+C / затворен терминал: първо спираме агента и рендера (иначе процесът на SDK остава сирак).
  const stop = () => {
    server.shutdown();
    server.closeAllConnections();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(sig, stop);
}

try {
  main();
} catch (e) {
  process.stderr.write(`Студио пулт не тръгна: ${(e as Error).message}\n`);
  process.exit(1);
}
