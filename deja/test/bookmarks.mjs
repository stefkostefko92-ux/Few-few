// Отметките в паметта — e2e в реален Chromium (билд dist-test: правото
// „bookmarks“ е дадено при инсталация, защото headless не може да приеме диалога).
// Покрива: импорт с прогрес през welcome картата, търсене по смисъл, съжителство
// с прочетена страница, жив синхрон (добавяне/триене), „забрави“, изключване.

import path from 'node:path';
import {
  startServer,
  launchWithExtension,
  visitAll,
  waitForIndex,
  makeChecker,
  FIXTURES,
} from './lib.mjs';

const EXT_TEST = path.resolve(import.meta.dirname, '..', 'dist-test');
const { check, finish } = makeChecker();
const server = await startServer(FIXTURES);
const { context, extId } = await launchWithExtension({ ext: EXT_TEST });
const ext = (f) => `chrome-extension://${extId}/${f}`;

// прочетена страница, която после става и отметка — текстът ѝ трябва да оцелее
await visitAll(context, { '/baterii': FIXTURES['/baterii'] });
await waitForIndex(context, extId, 1);

const page = await context.newPage();
await page.goto(ext('search.html'));
const call = (type, payload = {}) =>
  page.evaluate(
    ([type, payload]) => chrome.runtime.sendMessage({ type, ...payload }),
    [type, payload],
  );
const bm = (fn, arg) => page.evaluate(fn, arg);

// --- дърво с отметки ---
const ids = await bm(async () => {
  const bar = '1';
  const recipes = await chrome.bookmarks.create({ parentId: bar, title: 'Рецепти' });
  const photo = await chrome.bookmarks.create({ parentId: bar, title: 'Фото' });
  const science = await chrome.bookmarks.create({ parentId: bar, title: 'Наука' });
  const archive = await chrome.bookmarks.create({ parentId: bar, title: 'Архив' });
  const pork = await chrome.bookmarks.create({
    parentId: recipes.id,
    title: 'Бавно печено свинско с ябълки — рецепта',
    url: 'https://kuhnia.example.com/recepti/bavno-pecheno-svinsko',
  });
  const camera = await chrome.bookmarks.create({
    parentId: photo.id,
    title: 'Nikon Z6 III review: the best full-frame camera for video',
    url: 'https://example.com/cameras/nikon-z6-iii-review',
  });
  const battery = await chrome.bookmarks.create({
    parentId: science.id,
    title: 'Батерии',
    url: 'http://localhost:18080/baterii',
  });
  await chrome.bookmarks.create({
    parentId: bar,
    title: 'Банка',
    url: 'https://ebank.example.com/x',
  });
  // > 2 партиди по 32 — прогресът и партидите се упражняват истински
  for (let i = 1; i <= 70; i++) {
    await chrome.bookmarks.create({
      parentId: archive.id,
      title: `Бележка номер ${i}`,
      url: `https://notes.example.com/n/${i}`,
    });
  }
  return { pork: pork.id, camera: camera.id, battery: battery.id };
});

// --- включване от welcome картата (истинският UI път) ---
const welcome = await context.newPage();
await welcome.goto(ext('welcome.html'));
await welcome.click('#bm .bm-go');
const sawProgress = await welcome
  .waitForFunction(
    () => /\d/.test(document.querySelector('#bm .bm-status')?.textContent || ''),
    null,
    {
      timeout: 120000,
    },
  )
  .then(() => true)
  .catch(() => false);
await welcome.waitForFunction(() => document.querySelector('#bm')?.dataset.state === 'done', null, {
  timeout: 240000,
});
check('welcome: прогресът „научени N от M“ се вижда', sawProgress);
const chips = await welcome.$$eval('#bm .bm-try .chip', (els) => els.map((e) => e.textContent));
check('welcome: „Опитай:“ предлага папките на човека', chips.includes('Архив'));

const status = await page.evaluate(() => chrome.storage.local.get('bookmarkSync'));
check('синхрон: 73 отметки (банката е по вградения denylist)', status.bookmarkSync?.count === 73);
const stats = await call('deja:stats');
check('паметта: 1 прочетена + 72 само-отметки (батериите се сливат)', stats.result?.pages === 73);

// --- търсене по смисъл (без ключова дума от заглавието) ---
const pork = await call('deja:search', { query: 'как се приготвя месо на бавен огън' });
const top = pork.result?.[0];
check('търсене: рецептата излиза първа по смисъл', top?.title?.startsWith('Бавно печено свинско'));
check(
  'търсене: отметка → kind=bookmark, папка, без цитат за скок',
  top?.kind === 'bookmark' && top?.folder === 'Рецепти' && top?.quote === '',
);
const camera = await call('deja:search', { query: 'ревю на фотоапарат за видео' });
check(
  'търсене: междуезично (BG заявка → EN отметка)',
  camera.result?.[0]?.title?.startsWith('Nikon'),
);

// --- истинско намиране в UI-а: клик на резултат вдига брояча за молбата ---
await context.route('**/*.example.com/**', (route) => route.abort()); // без мрежа
const ui = await context.newPage();
await ui.goto(ext('search.html') + '?q=' + encodeURIComponent('рецепта за свинско'));
await ui.waitForSelector('.result a');
await ui.click('.result a');
await ui.waitForTimeout(400);
const wins = await ui.evaluate(() =>
  chrome.storage.local.get('rateAsk').then((r) => r.rateAsk?.wins),
);
check('намиране: клик на резултат = +1 успешно намиране', wins === 1);
check(
  'отметка в UI-а: знак „Отметка“ + папка, без откъс',
  (await ui.$('.result.is-bookmark .bm-tag')) !== null,
);
await ui.close();

// --- съжителство с прочетената страница ---
const list = await call('deja:memory:list');
const battery = list.result.find((p) => p.urlKey === 'http://localhost:18080/baterii');
const sodium = (await call('deja:search', { query: 'натриеви батерии' })).result?.[0];
check(
  'прочетена + отметка: пълният текст остава (откъс от статията, не заглавието на отметката)',
  battery?.kind === 'page' && sodium?.kind === 'page' && sodium?.snippet.includes('кобалт'),
);
check('прочетена + отметка: носи знак с папката', battery?.folder === 'Наука');
const recent = await call('deja:recent', { limit: 20 });
check('„последни спомени“ = само прочетеното', recent.result.length === 1);

// --- жив синхрон ---
const until = async (fn, arg, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn, arg)) return true;
    await page.waitForTimeout(500);
  }
  return false;
};
const has = (key) =>
  until(async (k) => {
    const r = await chrome.runtime.sendMessage({ type: 'deja:memory:list' });
    return r.result.some((p) => p.urlKey === k);
  }, key);
const gone = (key) =>
  until(async (k) => {
    const r = await chrome.runtime.sendMessage({ type: 'deja:memory:list' });
    return !r.result.some((p) => p.urlKey === k);
  }, key);

await bm(() =>
  chrome.bookmarks.create({
    parentId: '1',
    title: 'Средиземноморска диета: пълно ръководство',
    url: 'https://health.example.com/mediterranean-diet',
  }),
);
check(
  'жив синхрон: нова отметка влиза сама',
  await has('https://health.example.com/mediterranean-diet'),
);
await bm((id) => chrome.bookmarks.remove(id), ids.pork);
check(
  'жив синхрон: изтрита отметка излиза сама',
  await gone('https://kuhnia.example.com/recepti/bavno-pecheno-svinsko'),
);
await bm((id) => chrome.bookmarks.remove(id), ids.battery);
const unmarked = await until(async () => {
  const r = await chrome.runtime.sendMessage({ type: 'deja:memory:list' });
  const p = r.result.find((x) => x.urlKey === 'http://localhost:18080/baterii');
  return p && p.folder == null;
});
check(
  'жив синхрон: изтрита отметка на прочетена страница → страницата остава, знакът пада',
  unmarked,
);

// --- „забрави“ не се връща със синхрона ---
await call('deja:memory:delete', { urlKey: 'https://example.com/cameras/nikon-z6-iii-review' });
await bm(() =>
  chrome.bookmarks.create({ parentId: '1', title: 'Още една', url: 'https://more.example.com/x' }),
);
await has('https://more.example.com/x');
const camBack = (await call('deja:memory:list')).result.some((p) => p.urlKey.includes('nikon'));
check('забравена отметка остава забравена след следващия синхрон', !camBack);

// --- изключване: чисто излизане ---
await call('deja:bookmarks:disable');
const after = (await call('deja:memory:list')).result;
check(
  'изключване: само-отметките изчезват',
  after.every((p) => p.kind !== 'bookmark'),
);
check(
  'изключване: прочетеното остава',
  after.some((p) => p.urlKey === 'http://localhost:18080/baterii'),
);
const st = await page.evaluate(() => chrome.storage.local.get(['settings', 'bookmarkSync']));
check(
  'изключване: настройката е изключена, прогресът изчистен',
  !st.settings?.bookmarks && !st.bookmarkSync,
);

await context.close();
server.close();
finish();
