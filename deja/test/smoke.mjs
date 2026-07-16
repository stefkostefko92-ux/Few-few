// Déjà димен тест: ?q= авто-търсене (omnibox), дълбок линк (#:~:text=),
// датов филтър, свързани спомени, „Моята памет“ (списък/забравяне/export).

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
await waitForIndex(context, extId, 2, 300);

// 1) ?q= авто-търсене (omnibox пътят)
const search = await context.newPage();
await search.goto(
  `chrome-extension://${extId}/search.html?q=` +
    encodeURIComponent('евтина алтернатива на литиевите акумулатори'),
);
await search.waitForSelector('.result', { timeout: 120000 });
const firstUrl = await search.$eval('.result .url', (n) => n.textContent);
check('?q= авто-търсене връща резултати', firstUrl.includes('/baterii'));

// 2) дълбок линк с text fragment
const href = await search.$eval('.result a', (a) => a.href);
check('дълбок линк с #:~:text=', href.includes('#:~:text='));

// 3) датов филтър „последната седмица“ — страниците са пресни, остават
await search.click('.chip:nth-child(2)');
await search.waitForTimeout(3000);
const afterFilter = await search.$$eval('.result', (cards) => cards.length);
check('датов филтър (седмица) пази пресните страници', afterFilter >= 1);

// 4) свързани спомени
await search.click('.result .related-toggle');
await search.waitForTimeout(3000);
const relatedCount = await search.$$eval('.related-item, .related-none', (n) => n.length);
check('свързани спомени се зареждат', relatedCount >= 1);

// 5) „Моята памет“: списък + забравяне
const memory = await context.newPage();
await memory.goto(`chrome-extension://${extId}/memory.html`);
await memory.waitForSelector('.page-row', { timeout: 15000 });
const rowsBefore = await memory.$$eval('.page-row', (r) => r.length);
memory.on('dialog', (d) => d.accept());
await memory.click('.page-row .forget');
await memory.waitForTimeout(1500);
const rowsAfter = await memory.$$eval('.page-row', (r) => r.length);
check('моята памет: списък и забравяне', rowsBefore === 2 && rowsAfter === 1);

// 6) export дава валиден архив
const dump = await memory.evaluate(() => chrome.runtime.sendMessage({ type: 'deja:memory:export' }));
check(
  'export: валиден deja-memory архив',
  dump?.ok && dump.result?.format === 'deja-memory' && dump.result.pages.length === 1,
);

await context.close();
server.close();
finish();
