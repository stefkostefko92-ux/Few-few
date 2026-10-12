// „Отговор от паметта ти“ — e2e в реален Chromium. Gemini Nano иска GPU и
// теглене, затова тук LanguageModel е подменен с фалшив модел, който записва
// промпта и стриймва зададен отговор. Проверяваме НАШИЯ код: кога се показва,
// какво влиза в модела, цитати, поток, „Спри“, теглене, отказ, безопасно рисуване.

import {
  startServer,
  launchWithExtension,
  visitAll,
  waitForIndex,
  makeChecker,
  FIXTURES,
} from './lib.mjs';

const { check, finish } = makeChecker();
const server = await startServer(FIXTURES);
const { context, extId } = await launchWithExtension();
const ext = (f) => `chrome-extension://${extId}/${f}`;

// без подмяна: истинският API тук казва „unavailable“ → картата мълчи
await visitAll(context, FIXTURES);
await waitForIndex(context, extId, 2);
const real = await context.newPage();
await real.goto(ext('search.html') + '?q=' + encodeURIComponent('why are sodium batteries cheap?'));
await real.waitForSelector('.result');
await real.waitForTimeout(800);
check(
  'без модел на устройството: картата не се показва',
  await real.$eval('#answer', (n) => n.hidden),
);
await real.close();

await context.addInitScript(() => {
  const log = (globalThis.__lm = { calls: [], destroyed: 0 });
  const fake = {
    async availability(opts) {
      log.calls.push({ availability: opts });
      return localStorage.getItem('lmState') || 'available';
    },
    async create(opts) {
      log.calls.push({
        create: { system: opts.initialPrompts?.[0]?.content, out: opts.expectedOutputs },
      });
      if (opts.monitor) {
        const target = new EventTarget();
        opts.monitor(target);
        for (const loaded of [0.3, 1]) {
          target.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }));
        }
      }
      return {
        promptStreaming(text, { signal } = {}) {
          log.calls.push({ prompt: text });
          const answer =
            localStorage.getItem('lmAnswer') ||
            'Sodium batteries are cheaper because sodium is abundant [1]. They need no cobalt [1][9].';
          const parts = answer.match(/[\s\S]{1,10}/g);
          const delay = Number(localStorage.getItem('lmDelay') || 20);
          let i = 0;
          return new ReadableStream({
            async pull(c) {
              await new Promise((r) => setTimeout(r, delay));
              if (signal?.aborted) return c.error(new DOMException('aborted', 'AbortError'));
              if (i < parts.length) c.enqueue(parts[i++]);
              else c.close();
            },
          });
        },
        destroy() {
          log.destroyed++;
        },
      };
    },
  };
  Object.defineProperty(globalThis, 'LanguageModel', {
    value: fake,
    configurable: true,
    writable: true,
  });
});

const page = await context.newPage();
await page.goto(ext('search.html'));
const setLs = (k, v) =>
  page.evaluate(
    ([k, v]) => (v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v)),
    [k, v],
  );
async function search(q) {
  await page.fill('#query', q);
  await page.click('#go');
  await page.waitForSelector('.result');
  await page.waitForTimeout(150);
}
const doneText = () =>
  page.waitForFunction(
    () => {
      const foot = document.querySelector('.answer-foot');
      return foot && !foot.hidden;
    },
    null,
    { timeout: 15000 },
  );

// --- 1) въпрос + наличен модел → отговор сам, с цитати ---
await search('why are sodium batteries cheap?');
await doneText();
const text = await page.textContent('.answer-text');
check('въпрос: отговорът идва сам', text.includes('Sodium batteries are cheaper'));
const cites = await page.$$eval('.answer-text .cite', (els) =>
  els.map((a) => [a.textContent, a.getAttribute('href')]),
);
check(
  'цитати: [1] става линк към източника (с цитат за скок)',
  cites.length === 2 && cites[0][1].includes('/baterii#:~:text='),
);
check(
  'цитати: измислен [9] остава текст, не линк',
  text.includes('[9]') && !cites.some(([n]) => n === '9'),
);
const lm = await page.evaluate(() => globalThis.__lm);
const prompt = lm.calls.find((c) => c.prompt)?.prompt || '';
const sys = lm.calls.find((c) => c.create)?.create.system || '';
check(
  'модел: получава реалния откъс от паметта',
  prompt.includes('кобалт') && prompt.includes('Question: why are sodium batteries cheap?'),
);
check(
  'модел: системната инструкция пази от инжекция и външно знание',
  /untrusted data/.test(sys) && /outside knowledge/.test(sys),
);
check('модел: сесията се унищожава след отговора', lm.destroyed === 1);
check(
  'цитирана карта: същата „перла“ с номера стои на резултата',
  (await page.$$eval('.result .cite-badge', (b) => b.map((x) => x.textContent))).join() === '1',
);
check(
  'бележка: „съставен на устройството ти… провери източниците“',
  (await page.textContent('.answer-foot')).length > 20,
);

// --- 2) клик на цитат = успешно намиране ---
await context.route('http://localhost:18080/baterii', (r) => r.fulfill({ body: 'ok' }));
await page.click('.answer-text .cite');
await page.waitForTimeout(300);
const wins = await page.evaluate(() =>
  chrome.storage.local.get('rateAsk').then((r) => r.rateAsk?.wins),
);
check('цитат: кликът се брои за намиране', wins === 1);

// --- 3) не-въпрос → бутон при поискване ---
await search('sodium batteries');
check(
  'ключови думи: само бутон „Отговори от паметта ми“',
  (await page.$('.answer-ask')) !== null && (await page.$('.answer-text')) === null,
);
await page.click('.answer-ask');
await doneText();
check(
  'бутон: отговорът идва при поискване',
  (await page.textContent('.answer-text')).includes('cheaper'),
);

// --- 4) безопасно рисуване: HTML от модела е само текст ---
await setLs('lmAnswer', 'Evil <img src=x onerror="window.__pwned=1"> text [1].');
await search('what is in my memory?');
await doneText();
const pwned = await page.evaluate(() => ({
  img: !!document.querySelector('.answer img'),
  pwned: !!window.__pwned,
}));
check(
  'инжекция: HTML от модела се рисува като текст, нищо не се изпълнява',
  !pwned.img && !pwned.pwned,
);

// --- 5) „Спри“ по средата ---
await setLs(
  'lmAnswer',
  'A long answer that keeps going and going and going and going and going [1].',
);
await setLs('lmDelay', '120');
await search('how long is this answer?');
await page.waitForSelector('.answer-stop');
await page.waitForTimeout(400);
// (директен клик: позицията е проверена стабилна кадър по кадър — проверката за
// „стабилност“ на Playwright се спъва в анимирания фон, не в картата)
await page.$eval('.answer-stop', (b) => b.click());
await page.waitForTimeout(700);
const stopped = await page.textContent('.answer-text');
check('„Спри“: потокът спира, написаното остава', stopped.length > 0 && !stopped.includes('[1]'));
await setLs('lmDelay', null);
await setLs('lmAnswer', null);

// --- 6) ново търсене прекъсва стария отговор ---
await setLs('lmDelay', '150');
await search('how do batteries age?');
await page.waitForSelector('.answer-text');
await search('sodium batteries');
await page.waitForTimeout(600);
check('ново търсене: старият отговор изчезва', (await page.$('.answer-text')) === null);
await setLs('lmDelay', null);

// --- 7) моделът още не е изтеглен → „Включи отговорите“ + прогрес ---
await setLs('lmState', 'downloadable');
await search('why are sodium batteries cheap?');
await page.waitForSelector('.answer-enable');
check(
  'теглене: обяснение + бутон вместо автоматичен отговор',
  (await page.$('.answer-enable')) !== null && (await page.$('.answer-text')) === null,
);
await page.click('.answer-enable');
await doneText();
check(
  'теглене: след клика (жест) идва отговорът',
  (await page.textContent('.answer-text')).includes('cheaper'),
);

// --- 8) „Не, благодаря“ → изключено завинаги (до настройките) ---
await search('why are sodium batteries cheap?');
await page.click('.answer-no');
await search('why are batteries cheap?');
check('„Не, благодаря“: повече не предлагаме', await page.$eval('#answer', (n) => n.hidden));
const st = await page.evaluate(() => chrome.storage.local.get('settings'));
check('„Не, благодаря“: записано в настройките', st.settings?.answers === false);
await page.evaluate(() =>
  chrome.storage.local
    .get('settings')
    .then(({ settings }) => chrome.storage.local.set({ settings: { ...settings, answers: true } })),
);

// --- 9) устройството не поддържа → мълчание ---
await setLs('lmState', 'unavailable');
await search('why are sodium batteries cheap?');
check('неподдържано устройство: картата мълчи', await page.$eval('#answer', (n) => n.hidden));
await setLs('lmState', null);

// --- 10) страничният панел има същото ---
const panel = await context.newPage();
await panel.goto(ext('sidepanel.html'));
await panel.fill('#query', 'why are sodium batteries cheap?');
await panel.click('#go');
await panel.waitForFunction(
  () => !document.querySelector('.answer-foot')?.hidden && document.querySelector('.answer-foot'),
  null,
  { timeout: 15000 },
);
check('страничен панел: отговор с цитати', (await panel.$$('.answer-text .cite')).length > 0);

await context.close();
server.close();
finish();
