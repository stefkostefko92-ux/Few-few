/**
 * Сървърът за e2e (Playwright `webServer`): истинското приложение върху тестовата база, с фалшив
 * модел и фалшив антивирус, засят свят от `world.ts`. Готовността се обявява СЛЕД засяването —
 * отделен порт (E2E_READY_PORT), който отговаря чак когато данните са на място (без състезание).
 *   DATABASE_URL=…chatchat_test_ac npx tsx tests/e2e/server.ts
 */
import { createServer } from 'node:http';
import { cite, resetDb, startApp, type Plan } from '../integration/helpers.js';
import { FakeScanner, SpyStore, URL_KEY } from '../integration/files.js';
import { seedWorld } from '../integration/world.js';
import { E2E_ORIGIN, E2E_PORT, E2E_READY_PORT, PHOTO_CODE } from './support/constants.js';

await resetDb();
const h = await startApp({
  diagnose: 'real',
  attachments: { store: new SpyStore(), scanner: new FakeScanner(), urlKey: URL_KEY },
  port: E2E_PORT,
  origin: E2E_ORIGIN,
});

/** Обобщението на езика, поискан в съобщението на случая (FR-14: езикът на човека). */
const SUMMARY: Record<string, string> = {
  Italian: 'Diagnosi di prova.',
  English: 'Test diagnosis.',
  Bulgarian: 'Тестова диагноза.',
};

/**
 * Цитира първия съвместим източник; ако въпросът има снимка — добавя ясно наблюдение за нея;
 * обобщението е на езика от „Answer language: …“ (като истинския модел).
 */
const plan: Plan = (pack) => {
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
  await h.close();
  process.exit(0);
};
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
