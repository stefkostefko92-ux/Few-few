import assert from 'node:assert/strict';
import { test } from 'node:test';

import { averageRating, compareServers, isFeatured } from '../rating';
import { BASE_KEYWORDS, faqJsonLd, jsonLdString, pageMetadata, serverListJsonLd } from '../seo';

test('правилото на репото: ≥5 ключови думи, една е „Carbon Stealth“ — на ВСЕКИ език', () => {
  for (const locale of ['bg', 'en'] as const) {
    assert.ok(BASE_KEYWORDS[locale].length >= 5, `${locale}: под 5 ключови думи`);
    assert.ok(BASE_KEYWORDS[locale].includes('Carbon Stealth'), `${locale}: липсва Carbon Stealth`);
  }
});

test('всяка страница носи базовите ключови думи без дубли', () => {
  const meta = pageMetadata({
    locale: 'bg',
    title: 'Т',
    description: 'О',
    path: '/servers/x',
    keywords: ['Carbon Stealth', 'нещо'],
  });
  const keywords = meta.keywords as string[];
  assert.ok(keywords.includes('нещо'));
  assert.equal(keywords.filter((k) => k === 'Carbon Stealth').length, 1);
  assert.match(String(meta.alternates?.canonical), /\/bg\/servers\/x$/);
  // Всяка страница изброява езиковите си близнаци — иначе двата езика се
  // конкурират за едно и също запитване.
  const languages = meta.alternates?.languages as Record<string, string>;
  assert.match(languages.en, /\/en\/servers\/x$/);
  assert.ok(languages['x-default']);
});

test('noindex се задава само когато е поискан', () => {
  assert.equal(pageMetadata({ locale: 'bg', title: 'T', description: 'D' }).robots, undefined);
  assert.deepEqual(pageMetadata({ locale: 'bg', title: 'T', description: 'D', noindex: true }).robots, {
    index: false,
    follow: false,
  });
});

test('JSON-LD не може да затвори <script> (XSS от име на сървър)', () => {
  const payload = serverListJsonLd('bg', [
    { slug: 'x', name: '</script><img src=x onerror=alert(1)>' },
  ]);
  const serialized = jsonLdString(payload);
  assert.ok(!serialized.includes('</script>'));
  assert.ok(serialized.includes('\\u003c'));
});

test('FAQ JSON-LD има правилната форма', () => {
  const ld = faqJsonLd([{ question: 'В?', answer: 'О.' }]);
  assert.equal(ld['@type'], 'FAQPage');
  assert.equal(ld.mainEntity[0].acceptedAnswer.text, 'О.');
});

test('средната оценка се закръгля до 0.1', () => {
  assert.equal(averageRating([]), null);
  assert.equal(averageRating([{ rating: 5 }, { rating: 4 }]), 4.5);
  assert.equal(averageRating([{ rating: 5 }, { rating: 4 }, { rating: 4 }]), 4.3);
});

test('промотирането изтича', () => {
  const now = new Date('2026-01-10T00:00:00Z');
  assert.equal(isFeatured({ featuredUntil: new Date('2026-01-11T00:00:00Z') }, now), true);
  assert.equal(isFeatured({ featuredUntil: new Date('2026-01-09T00:00:00Z') }, now), false);
  assert.equal(isFeatured({ featuredUntil: null }, now), false);
});

test('изтекла промоция НЕ държи ранг (недеклариран платен ранг)', () => {
  // Регресия: подредбата беше само в SQL (`featuredUntil DESC`), който вдига и
  // изтеклите. Резултатът: изтекъл спонсор стои над безплатен сървър със 180
  // играчи, но БЕЗ значка „промотиран“ — платен ранг, който не е обявен.
  const now = new Date('2026-08-01T00:00:00Z');
  const expired = {
    featuredUntil: new Date('2026-07-01T00:00:00Z'),
    online: false,
    players: 0,
    name: 'Изтекъл',
  };
  const free = { featuredUntil: null, online: true, players: 180, name: 'Безплатен' };
  const active = {
    featuredUntil: new Date('2026-09-01T00:00:00Z'),
    online: true,
    players: 3,
    name: 'Активен',
  };

  const order = [expired, free, active].sort((a, b) => compareServers(a, b, now)).map((s) => s.name);
  assert.deepEqual(order, ['Активен', 'Безплатен', 'Изтекъл']);
});
