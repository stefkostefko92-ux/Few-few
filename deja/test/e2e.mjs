// Déjà e2e: посещение на две страници → индексиране → семантично търсене
// с перифразирана заявка връща правилната страница на първо място.

import {
  startServer,
  launchWithExtension,
  visitAll,
  waitForIndex,
  makeChecker,
  FIXTURES,
} from './lib.mjs';

const server = await startServer(FIXTURES);
const { context, extId } = await launchWithExtension();
const { check, finish } = makeChecker();

await visitAll(context, FIXTURES);
const indexed = await waitForIndex(context, extId, 2, 300);
check('двете страници са индексирани', indexed >= 2);

const search = await context.newPage();
await search.goto(`chrome-extension://${extId}/search.html`);
// думата „акумулатори“ не се среща в текста — търсим по смисъл
await search.fill('#query', 'евтина алтернатива на литиевите акумулатори');
await search.click('#go');
await search.waitForSelector('.result', { timeout: 120000 });
const firstUrl = await search.$eval('.result .url', (n) => n.textContent);
check('семантичното търсене връща правилната страница първа', firstUrl.includes('/baterii'));

await context.close();
server.close();
finish();
