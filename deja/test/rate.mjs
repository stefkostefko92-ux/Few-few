// Молбата за отзив: кога се пита (чисто правило) + истинската карта в търсачката.
import { shouldAsk } from '../src/lib/rate.js';
import { launchWithExtension, makeChecker } from './lib.mjs';

const { check, finish } = makeChecker();
const DAY = 24 * 60 * 60 * 1000;
const base = { wins: 0, asks: 0, decided: null, laterAt: 0, laterWins: 0 };

// --- правилото ---
check('правило: 2 намирания → още не питаме', !shouldAsk({ ...base, wins: 2 }));
check('правило: 3-тото намиране → питаме', shouldAsk({ ...base, wins: 3 }));
check(
  'правило: оценил → никога повече',
  !shouldAsk({ ...base, wins: 99, asks: 1, decided: 'rated' }),
);
check(
  'правило: писал обратна връзка → никога повече',
  !shouldAsk({ ...base, wins: 99, asks: 1, decided: 'feedback' }),
);
const later = { ...base, wins: 5, asks: 1, laterAt: 1000, laterWins: 5 };
check('правило: „Не сега“ → не и до 30 дни', !shouldAsk({ ...later, wins: 40 }, 1000 + 10 * DAY));
check('правило: „Не сега“ → не и без 10 нови намирания', !shouldAsk(later, 1000 + 40 * DAY));
check(
  'правило: след 30 дни + 10 намирания → питаме втори път',
  shouldAsk({ ...later, wins: 15 }, 1000 + 31 * DAY),
);
check('правило: максимум 2 молби', !shouldAsk({ ...later, wins: 99, asks: 2 }, 1000 + 99 * DAY));

// --- картата в истинската търсачка ---
const { context, extId } = await launchWithExtension();
await context.route('**/chromewebstore.google.com/**', (route) => route.abort()); // без мрежа
const page = await context.newPage();
await page.goto(`chrome-extension://${extId}/search.html`);
const setState = (s) => page.evaluate((s) => chrome.storage.local.set({ rateAsk: s }), s);
const getState = () =>
  page.evaluate(() => chrome.storage.local.get('rateAsk').then((r) => r.rateAsk));

// млада памет: поканата за отметки е на екрана → молбата чака (една покана наведнъж)
await setState({ ...base, wins: 3 });
await page.reload();
await page.waitForSelector('#bmCta:not([hidden])', { timeout: 5000 });
await page.waitForTimeout(600);
check(
  'една покана наведнъж: при поканата за отметки молбата чака',
  (await page.$('.nudge')) === null,
);

// зряла памет (отметките вече са включени — поканата я няма)
await page.evaluate(() => chrome.storage.local.set({ settings: { bookmarks: true } }));
await setState({ ...base, wins: 2 });
await page.reload();
await page.waitForTimeout(600);
check('карта: под прага не се показва', (await page.$('.nudge')) === null);

await setState({ ...base, wins: 3 }); // третото намиране пристига, докато страницата е отворена
await page.waitForSelector('.nudge', { timeout: 5000 });
const title = await page.textContent('.nudge-title');
check('карта: появява се на живо и казва колко пъти е помогнал', title.includes('3'));
const href = await page.getAttribute('.nudge-rate', 'href');
check(
  'карта: „Оцени“ води към отзивите на ТОВА разширение',
  href === `https://chromewebstore.google.com/detail/${extId}/reviews`,
);
const mail = await page.getAttribute('.nudge-feedback', 'href');
check(
  'карта: „Нещо не работи?“ е писмо без данни от паметта',
  mail.startsWith('mailto:info@carbonstealth.eu') && !mail.includes('localhost'),
);

await page.click('.nudge-later');
await page.waitForTimeout(300);
let st = await getState();
check(
  '„Не сега“: картата изчезва, броим 1 молба',
  (await page.$('.nudge')) === null && st.asks === 1 && !st.decided,
);

// 31 дни и 10 намирания по-късно → втори път
await setState({ ...st, wins: st.wins + 10, laterAt: Date.now() - 31 * DAY });
await page.reload();
await page.waitForSelector('.nudge', { timeout: 5000 });
check('след 30 дни + 10 намирания: питаме втори (последен) път', true);
await page.click('.nudge-rate');
await page.waitForTimeout(400);
st = await getState();
check(
  '„Оцени“: благодарност и решението се помни',
  st.decided === 'rated' && (await page.textContent('.nudge')).length > 0,
);
await setState({ ...st, wins: 500 });
await page.reload();
await page.waitForTimeout(600);
check('оценил: никога повече', (await page.$('.nudge')) === null);

await context.close();
finish();
