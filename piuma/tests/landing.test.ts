import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { LOCALES, translate } from '../src/i18n.js';

/* Витрината е единствената публична страница: тя е и лицето на продукта, и целият му
   слой за откриваемост. Тези гейтове пазят точно това, което мълчаливо се чупи —
   изображение без размери (скачащо оформление), домейн, зашит в кода, или обещание в
   текста, което продуктът не спазва. */

const VIEW = readFileSync('views/landing/index.ejs', 'utf8');
const ROUTES = readFileSync('src/landing/routes.ts', 'utf8');

test('всяко изображение носи alt, ширина и височина', () => {
  // EJS изразът `<%= … %>` завършва на `>`, затова простото `[^>]*` реже етикета по
  // средата и всеки атрибут след него изглеждаше липсващ.
  const images = [...VIEW.matchAll(/<img\b(?:<%[\s\S]*?%>|[^>])*>/g)].map((m) => m[0]);
  assert.ok(images.length >= 4, `очаквахме снимките на панела, намерихме ${images.length}`);
  for (const tag of images) {
    assert.match(tag, /\salt="/, `без alt: ${tag.slice(0, 90)}`);
    // Без двата размера браузърът не пази място и оформлението скача (CLS).
    assert.match(tag, /\swidth="\d+"/, `без width: ${tag.slice(0, 90)}`);
    assert.match(tag, /\sheight="\d+"/, `без height: ${tag.slice(0, 90)}`);
  }
});

/**
 * Снимките на панела са по език — иначе италианецът гледа български екран. Шаблонът
 * ги избира с `<%= locale %>`, значи липсващ файл е счупено изображение в продукция.
 */
test('всяка снимка на панела съществува и за трите езика', () => {
  const templated = [...VIEW.matchAll(/\/static\/(landing\/[\w-]+)-<%= locale %>\.webp/g)].map(
    (m) => m[1]!,
  );
  assert.ok(templated.length >= 4, `очаквахме снимки по език, намерихме ${templated.length}`);
  for (const base of templated) {
    for (const locale of LOCALES) {
      const file = `public/${base}-${locale}.webp`;
      assert.ok(existsSync(file), `липсва ${file}`);
      // Празен или почти празен файл значи неуспяло снимане, не изображение.
      assert.ok(statSync(file).size > 8_000, `${file} е подозрително малък`);
      // Лекият вариант за телефон (`srcset`) трябва да съществува и да е наистина по-лек —
      // иначе телефонът пак тегли 1600 px. Прави се от `npm run landing:variants`.
      const light = `public/${base}-${locale}-800.webp`;
      assert.ok(existsSync(light), `липсва ${light} — пусни npm run landing:variants`);
      assert.ok(statSync(light).size > 4_000, `${light} е подозрително малък`);
      assert.ok(statSync(light).size < statSync(file).size, `${light} не е по-лек от оригинала`);
    }
  }
});

test('всяка снимка на панела дава лек вариант на телефона', () => {
  const images = [...VIEW.matchAll(/<img\b(?:<%[\s\S]*?%>|[^>])*>/g)].map((m) => m[0]);
  const shots = images.filter((tag) => tag.includes('/static/landing/panel-'));
  assert.ok(shots.length >= 4);
  for (const tag of shots) {
    assert.match(tag, /\ssrcset="[^"]*-800\.webp 800w/, `без лек вариант: ${tag.slice(0, 90)}`);
    assert.match(tag, /\ssizes="/, `srcset без sizes: ${tag.slice(0, 90)}`);
  }
});

test('декоративното перо не се тегли на телефон', () => {
  // Скрит `<img>` се сваля въпреки `display: none`; скрит CSS фон — не.
  assert.doesNotMatch(VIEW, /<img[^>]+plume\.webp/, 'перото пак е <img> — телефонът ще го тегли');
  const css = readFileSync('public/landing.css', 'utf8');
  assert.match(css, /\.lp-hero-art\s*\{[^}]*url\('\/static\/landing\/plume\.webp'\)/);
  assert.match(css, /@media \(max-width: 1000px\)\s*\{[^@]*\.lp-hero-art\s*\{\s*display: none;/);
});

test('страницата има точно едно H1', () => {
  assert.equal((VIEW.match(/<h1[\s>]/g) ?? []).length, 1);
});

test('адресите се строят от конфигурацията, не са зашити', () => {
  // Позволени са само неща, които НЕ са среда: сайтът на собственика и постоянните
  // идентификатори на речниците (schema.org, sitemap и XHTML пространствата от имена).
  const ALLOWED = [
    'https://carbonstealth.eu',
    'https://schema.org',
    'http://www.sitemaps.org/',
    'http://www.w3.org/',
  ];
  const urls = [...ROUTES.matchAll(/https?:\/\/[^'"`\s)]+/g)].map((m) => m[0]);
  const foreign = urls.filter((url) => !ALLOWED.some((prefix) => url.startsWith(prefix)));
  assert.deepEqual(foreign, [], `зашити адреси: ${foreign.join(', ')}`);
  assert.match(ROUTES, /PUBLIC_BASE_URL/, 'публичната основа трябва да идва от конфигурацията');
});

test('всеки език носи поне пет ключови думи, една от които „Carbon Stealth“', () => {
  for (const locale of LOCALES) {
    const keywords = translate(locale, 'landing.meta.keywords')
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean);
    assert.ok(keywords.length >= 5, `${locale}: само ${keywords.length} ключови думи`);
    assert.ok(
      keywords.some((word) => word.toLowerCase().includes('carbon stealth')),
      `${locale}: липсва „Carbon Stealth“ сред ключовите думи`,
    );
  }
});

test('заглавието и описанието се побират в резултата на търсачката', () => {
  for (const locale of LOCALES) {
    const title = translate(locale, 'landing.meta.title');
    const description = translate(locale, 'landing.meta.description');
    assert.ok(title.length <= 60, `${locale}: заглавие от ${title.length} знака (макс 60)`);
    assert.ok(
      description.length >= 80 && description.length <= 165,
      `${locale}: описание от ${description.length} знака (80–165)`,
    );
  }
});

test('подписът на Carbon Stealth VCC стои в долния колонтитул', () => {
  assert.match(VIEW, /href="https:\/\/carbonstealth\.eu"[^>]*target="_blank"[^>]*rel="noopener"/);
  for (const locale of LOCALES) {
    assert.equal(
      translate(locale, 'landing.footer.madeBy'),
      'Created and Designed by Carbon Stealth VCC',
      `${locale}: подписът се превежда, а не бива`,
    );
  }
});

test('всеки въпрос има отговор на трите езика', () => {
  const asked = [...VIEW.matchAll(/landing\.faq\.(q\d+)/g)].map((m) => m[1]!);
  const keys = [...new Set([...asked, ...[...ROUTES.matchAll(/'(q\d+)'/g)].map((m) => m[1]!)])];
  assert.ok(keys.length >= 5, `очаквахме поне пет въпроса, намерихме ${keys.length}`);
  for (const locale of LOCALES) {
    for (const key of keys) {
      const question = translate(locale, `landing.faq.${key}`);
      const answer = translate(locale, `landing.faq.${key.replace('q', 'a')}`);
      assert.notEqual(question, `landing.faq.${key}`, `${locale}: липсва въпрос ${key}`);
      assert.ok(answer.length > 40, `${locale}: отговорът на ${key} е твърде къс`);
    }
  }
});

/**
 * Марката и перото са подадена рисунка, обработена от `src/scripts/landing-art.mjs`.
 * Черният фон ТРЯБВА да е свален — сложени върху аврората неотрязани, те стоят като
 * правоъгълник. Затова файлът трябва да носи алфа, а не просто да съществува.
 */
test('логото и перото са с прозрачен фон', () => {
  for (const name of ['logo', 'logo-160', 'plume']) {
    const file = `public/landing/${name}.webp`;
    assert.ok(existsSync(file), `липсва ${file}`);
    const header = readFileSync(file).subarray(0, 32);
    assert.equal(header.subarray(0, 4).toString('latin1'), 'RIFF', `${file}: не е WebP`);
    assert.equal(header.subarray(8, 12).toString('latin1'), 'WEBP', `${file}: не е WebP`);
    // VP8L носи алфа във флага си; VP8X я обявява в битовете на разширения хедър.
    const chunk = header.subarray(12, 16).toString('latin1');
    const hasAlpha =
      (chunk === 'VP8X' && (header[20]! & 0b0001_0000) !== 0) ||
      (chunk === 'VP8L' && (header[24]! & 0b0001_0000) !== 0);
    assert.ok(hasAlpha, `${file}: WebP без алфа-канал (${chunk})`);
  }
});

/**
 * Ключът за IndexNow е публичен знак за собственост, не тайна — но трябва да е валиден
 * и да се отдава от корена, иначе подаването към Bing/Yandex/Seznam се отказва тихо.
 */
test('ключът за IndexNow е валиден и се отдава от корена', () => {
  const key = readFileSync('public/indexnow-key.txt', 'utf8').trim();
  assert.match(key, /^[0-9a-f]{32}$/, 'ключът трябва да е 32 шестнайсетични знака');
  assert.match(ROUTES, /'\/indexnow-key\.txt'/, 'липсва маршрутът за ключа');
  assert.match(ROUTES, /\$\{INDEXNOW_KEY\}\.txt/, 'липсва адресът `/<ключ>.txt` от протокола');
});

/**
 * Витрината обещава неща, които са инварианти на продукта. Ако текстът тръгне да
 * обещава публикуване без човек, гейтът трябва да пада преди читателя да го види.
 */
test('текстът не обещава автоматично публикуване без човек', () => {
  const forbidden = [
    /публикува\s+автоматично/i,
    /publishes\s+automatically/i,
    /pubblica\s+automaticamente/i,
    /без\s+одобрение/i,
    /without\s+approval/i,
    /senza\s+approvazione/i,
  ];
  for (const locale of LOCALES) {
    const copy = ['hero.lead', 'how.step3Body', 'autopilot.lead', 'autopilot.title', 'faq.a2']
      .map((key) => translate(locale, `landing.${key}`))
      .join(' ');
    for (const pattern of forbidden) {
      assert.doesNotMatch(copy, pattern, `${locale}: обещание, което продуктът не спазва`);
    }
  }
});
