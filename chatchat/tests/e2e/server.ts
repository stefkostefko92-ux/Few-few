/**
 * Сървърът за e2e (Playwright `webServer`): истинското приложение върху тестовата база, с фалшив
 * модел и фалшив антивирус, засят свят от `world.ts`. Готовността се обявява СЛЕД засяването —
 * отделен порт (E2E_READY_PORT), който отговаря чак когато данните са на място (без състезание).
 *   DATABASE_URL=…chatchat_test_ac npx tsx tests/e2e/server.ts
 */
import { createServer } from 'node:http';
import { IntegrationWorker } from '../../src/services/integrations/worker.js';
import { cite, db, resetDb, startApp, type Plan } from '../integration/helpers.js';
import { FakeScanner, SpyStore, URL_KEY } from '../integration/files.js';
import { FakeHelpdesk } from '../integration/helpdesk-fake.js';
import { localDeps } from '../integration/helpdesk-world.js';
import { seedWorld } from '../integration/world.js';
import { twoSteps } from '../integration/flow-world.js';
import {
  E2E_HELPDESK_PORT,
  E2E_ORIGIN,
  E2E_PORT,
  E2E_READY_PORT,
  PHOTO_CODE,
} from './support/constants.js';

await resetDb();
// Интеграцията с helpdesk (FR-09): фалшив helpdesk на фиксиран порт и изпращач на всяка секунда.
const helpdesk = new FakeHelpdesk();
await helpdesk.start(E2E_HELPDESK_PORT);
const integrations = localDeps(helpdesk);
const h = await startApp({
  diagnose: 'real',
  attachments: { store: new SpyStore(), scanner: new FakeScanner(), urlKey: URL_KEY },
  port: E2E_PORT,
  origin: E2E_ORIGIN,
  integrations,
});
const quiet = { info: () => undefined, warn: () => undefined };
const helpdeskWorker = new IntegrationWorker({ db, integrations, logger: quiet }, 1);
helpdeskWorker.start();

/** Обобщението на езика, поискан в съобщението на случая (FR-14: езикът на човека). */
const SUMMARY: Record<string, string> = {
  Italian: 'Diagnosi di prova.',
  English: 'Test diagnosis.',
  Bulgarian: 'Тестова диагноза.',
};

/**
 * Цитира първия съвместим източник; ако въпросът има снимка — добавя ясно наблюдение за нея;
 * обобщението е на езика от „Answer language: …“ (като истинския модел).
 * Въпрос за „contatto porta“ → отговор с две стъпки (диагностична + по безопасност по
 * процедурата PROC-DOOR-001) — за потока на тикета (ticket-flow.spec.ts).
 */
const plan: Plan = (pack, call) => {
  if (
    /contatto porta/i.test(call.question) &&
    pack.some((p) => p.documentCode === 'PROC-DOOR-001')
  ) {
    return twoSteps(pack, call);
  }
  const first = pack.find((p) => p.applicable);
  const photoSent = (h.model.images.at(-1)?.length ?? 0) > 0;
  const language = /Answer language: (\w+)/.exec(h.model.texts.at(-1) ?? '')?.[1] ?? 'Italian';
  return {
    summary: SUMMARY[language] ?? SUMMARY.Italian,
    ...(first
      ? {
          causes: [{ text: 'Causa documentata', evidenceRefs: [first.ref] }],
          evidenceUsed: [cite(first)],
        }
      : {}),
    ...(photoSent
      ? {
          photoObservations: [
            {
              ref: 'P1',
              readability: 'clear' as const,
              subject: 'display' as const,
              visibleText: [PHOTO_CODE],
              errorCodes: [PHOTO_CODE],
              nameplate: null,
              terminalLabels: [],
              note: '',
              confidence: 'high' as const,
            },
          ],
        }
      : {}),
  };
};
h.model.plan = plan;

await seedWorld(h);

const ready = createServer((_req, res) => res.writeHead(200).end('ready'));
ready.listen(E2E_READY_PORT, '127.0.0.1');
console.log('E2E READY', E2E_ORIGIN);

const stop = async () => {
  ready.close();
  helpdeskWorker.stop();
  await helpdesk.close();
  await h.close();
  process.exit(0);
};
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
