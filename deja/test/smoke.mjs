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

// 7) v1.3: „запомни избрания текст“ → отделен спомен; последни; контекст; панел
const bg = await context.newPage();
await bg.goto(`chrome-extension://${extId}/search.html`);
const clip = await bg.evaluate(() =>
  chrome.runtime.sendMessage({
    type: 'deja:clip',
    url: 'http://localhost:18080/baterii',
    title: 'Бъдещето на натриевите батерии',
    text: 'Натрият е хиляда пъти по-разпространен от лития и не изисква кобалт или никел, което сваля цената на клетката.',
  }),
);
check('clip: избраният текст е приет', clip?.ok && clip.result?.clipped === true);
let recent = [];
for (let i = 0; i < 20; i++) {
  await bg.waitForTimeout(3000);
  const res = await bg.evaluate(() => chrome.runtime.sendMessage({ type: 'deja:recent', limit: 8 }));
  recent = res?.result || [];
  if (recent.some((r) => r.url.includes('#clip-'))) break;
}
check(
  'clip: индексиран като отделен спомен (✂ заглавие)',
  recent.some((r) => r.url.includes('#clip-') && r.title.startsWith('✂')),
);
const ctx = await bg.evaluate(() =>
  chrome.runtime.sendMessage({
    type: 'deja:context',
    url: 'http://localhost:18080/baterii',
    title: 'Бъдещето на натриевите батерии',
  }),
);
check('context: индексирана страница дава свързани', ctx?.ok && ctx.result?.indexed === true);
const forgot = await bg.evaluate(() =>
  chrome.runtime.sendMessage({ type: 'deja:forget-url', url: 'http://localhost:18080/baterii' }),
);
const afterForget = await bg.evaluate(() =>
  chrome.runtime.sendMessage({ type: 'deja:memory:list' }),
);
check(
  'forget-url: страницата е забравена, clip-ът остава',
  forgot?.ok &&
    !afterForget.result.some((p) => p.urlKey === 'http://localhost:18080/baterii') &&
    afterForget.result.some((p) => p.urlKey.includes('#clip-')),
);

const panel = await context.newPage();
await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
await panel.waitForSelector('#recent .mini, #recent .empty', { timeout: 15000 });
const panelRows = await panel.$$eval('#recent .mini', (r) => r.length);
check('страничен панел: последните спомени се зареждат', panelRows >= 1);

await context.close();
server.close();
finish();
