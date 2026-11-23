import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAutoTranslation,
  autoTranslateActive,
  createHourlyLimiter,
  isBotUserAgent,
  pickProfileView,
  profileSource,
  sourceHash,
} from '../auto-translate';

// Спецификация: docs/geo-autotranslate-spec.md (Б), критерии 5–11.

const base = {
  available: ['bg'],
  defaultLocale: 'bg',
  autoTranslate: true,
  isBot: false,
  acceptLanguage: null as string | null,
  country: null as string | null,
};

test('5: италианец (IP IT), профил само на български → автоматичен превод на италиански', () => {
  assert.deepEqual(pickProfileView({ ...base, country: 'IT' }), { locale: 'it', mode: 'auto' });
});

test('6: създателят е изключил превода → оригиналът', () => {
  assert.deepEqual(pickProfileView({ ...base, country: 'IT', autoTranslate: false }), { locale: 'bg', mode: 'own' });
});

test('7: създателят има италиански → неговият превод', () => {
  assert.deepEqual(pickProfileView({ ...base, available: ['bg', 'it'], country: 'IT' }), { locale: 'it', mode: 'own' });
});

test('8: диалект никога не се превежда автоматично (?hl=nap) → основният език', () => {
  assert.deepEqual(pickProfileView({ ...base, hl: 'nap' }), { locale: 'bg', mode: 'own' });
});

test('9: бот (Googlebot от САЩ) → без машинен превод', () => {
  assert.deepEqual(pickProfileView({ ...base, country: 'US', isBot: true }), { locale: 'bg', mode: 'own' });
  assert.equal(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
  assert.equal(isBotUserAgent('facebookexternalhit/1.1'), true);
  assert.equal(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1'), false);
  assert.equal(isBotUserAgent(null), false);
});

test('?hl: изричен език — свой превод или автоматичен; непознат → по автоматичния ред', () => {
  assert.deepEqual(pickProfileView({ ...base, available: ['bg', 'en'], hl: 'en', country: 'IT' }), { locale: 'en', mode: 'own' });
  assert.deepEqual(pickProfileView({ ...base, hl: 'de' }), { locale: 'de', mode: 'auto' });
  assert.deepEqual(pickProfileView({ ...base, hl: 'xx', country: 'FR' }), { locale: 'fr', mode: 'auto' });
});

test('браузър на езика на оригинала печели пред държавата (българин в Германия)', () => {
  assert.deepEqual(
    pickProfileView({ ...base, country: 'DE', acceptLanguage: 'bg-BG,bg;q=0.9,de;q=0.8' }),
    { locale: 'bg', mode: 'own' },
  );
});

test('неизвестна държава → свой превод от Accept-Language, иначе автоматичен на основния му език', () => {
  assert.deepEqual(
    pickProfileView({ ...base, available: ['bg', 'en'], acceptLanguage: 'pl-PL,pl;q=0.9,en;q=0.5' }),
    { locale: 'en', mode: 'own' },
  );
  assert.deepEqual(pickProfileView({ ...base, acceptLanguage: 'pl-PL,pl;q=0.9' }), { locale: 'pl', mode: 'auto' });
  assert.deepEqual(pickProfileView({ ...base, acceptLanguage: 'ja' }), { locale: 'bg', mode: 'own' });
});

const profile = {
  id: 'p1',
  defaultLocale: 'bg',
  translations: [{ id: 't1', profileId: 'p1', locale: 'bg', displayName: 'Мария', bio: 'Фотограф' }],
  links: [
    { id: 'l1', translations: [{ id: 'x1', linkId: 'l1', locale: 'bg', title: 'Магазин' }] },
    { id: 'l2', translations: [] },
  ],
  products: [
    { id: 'r1', translations: [{ id: 'y1', productId: 'r1', locale: 'bg', title: 'Принт', description: 'А4' }] },
  ],
};

test('profileSource: съдържанието на основния език (без празните блокове)', () => {
  assert.deepEqual(profileSource(profile), {
    from: 'bg',
    content: {
      displayName: 'Мария',
      bio: 'Фотограф',
      links: [{ id: 'l1', title: 'Магазин' }],
      products: [{ id: 'r1', title: 'Принт', description: null }],
    },
  });
});

test('10: хешът се сменя при промяна на съдържанието', () => {
  const source = profileSource(profile)!;
  const same = profileSource(profile)!;
  assert.equal(sourceHash(source), sourceHash(same));
  const changed = profileSource({
    ...profile,
    translations: [{ ...profile.translations[0], bio: 'Фотограф и видеограф' }],
  })!;
  assert.notEqual(sourceHash(source), sourceHash(changed));
});

test('applyAutoTranslation: добавя езика като превод (копие), реже дължините, пропуска чуждото', () => {
  const view = applyAutoTranslation(
    profile,
    'it',
    {
      displayName: 'Maria',
      bio: 'Fotografa',
      links: { l1: 'Negozio', чужд: 'x', l2: 42 as unknown as string },
      products: { r1: { title: 'Stampa', description: 'зло: машинно описание' } },
    },
    'bg',
  );
  assert.equal(view.translations.find((t) => t.locale === 'it')?.displayName, 'Maria');
  assert.equal(view.links[0].translations.find((t) => t.locale === 'it')?.title, 'Negozio');
  assert.equal(view.links[1].translations.length, 0);
  assert.equal(view.products[0].translations.find((t) => t.locale === 'it')?.title, 'Stampa');
  // Описанието на продукта не се превежда машинно — остава оригиналното.
  assert.equal(view.products[0].translations.find((t) => t.locale === 'it')?.description, 'А4');
  assert.equal(profile.translations.length, 1); // оригиналът не е пипнат
  const long = applyAutoTranslation(profile, 'it', { displayName: 'я'.repeat(500), links: {} }, 'bg');
  assert.equal(long.translations.find((t) => t.locale === 'it')?.displayName.length, 100);
  assert.equal(long.translations.find((t) => t.locale === 'it')?.bio, 'Фотограф'); // липсващо био → оригиналът
});

test('createHourlyLimiter: най-много N пресни превода на профил на час', () => {
  let now = 0;
  const limiter = createHourlyLimiter(2, () => now);
  assert.equal(limiter('p1'), true);
  assert.equal(limiter('p1'), true);
  assert.equal(limiter('p1'), false);
  assert.equal(limiter('p2'), true);
  now = 60 * 60 * 1000 + 1;
  assert.equal(limiter('p1'), true);
});

test('autoTranslateActive: on / off / pending до датата и след нея', () => {
  const now = new Date('2026-12-10T12:00:00Z');
  assert.equal(autoTranslateActive({ autoTranslateMode: 'on', autoTranslateStartsAt: null }, now), true);
  assert.equal(autoTranslateActive({ autoTranslateMode: 'off', autoTranslateStartsAt: null }, now), false);
  // Профил отпреди функцията без уведомление — не се включва.
  assert.equal(autoTranslateActive({ autoTranslateMode: 'pending', autoTranslateStartsAt: null }, now), false);
  assert.equal(
    autoTranslateActive({ autoTranslateMode: 'pending', autoTranslateStartsAt: new Date('2026-12-11T00:00:00Z') }, now),
    false,
  );
  assert.equal(
    autoTranslateActive({ autoTranslateMode: 'pending', autoTranslateStartsAt: new Date('2026-12-05T00:00:00Z') }, now),
    true,
  );
});

import { createTtlSet } from '../auto-translate';

test('createTtlSet: помни неуспеха за срока, после го забравя', () => {
  let now = 0;
  const failed = createTtlSet(1000, 2, () => now);
  failed.add('p1:it');
  assert.equal(failed.has('p1:it'), true);
  now = 999;
  assert.equal(failed.has('p1:it'), true);
  now = 1000;
  assert.equal(failed.has('p1:it'), false);
  failed.add('a');
  failed.add('b');
  failed.add('c'); // над тавана — най-старият излиза, без да расте паметта
  assert.equal(failed.has('a'), false);
});

import { autoTranslateNoticeEmail, autoTranslateStartDate } from '../auto-translate-notice';

test('уведомлението: ≥14 пълни дни, дата и възражение в писмото, HTML е екраниран', () => {
  const notified = new Date('2026-11-21T18:00:00Z');
  const start = autoTranslateStartDate(notified);
  assert.equal(start.toISOString(), '2026-12-06T00:00:00.000Z');
  assert.ok(start.getTime() - notified.getTime() >= 14 * 86_400_000);
  const mail = autoTranslateNoticeEmail({
    locale: 'bg',
    slugs: ['maria', 'x<script>'],
    startsAt: start,
    baseUrl: 'https://piuma.carbonstealth.eu/',
  });
  assert.match(mail.subject, /6 декември 2026/);
  assert.ok(mail.html.includes('/u/x&lt;script&gt;') && !mail.html.includes('<script>'));
  assert.ok(mail.html.includes('https://piuma.carbonstealth.eu/bg/dashboard#languages'));
  assert.ok(mail.html.includes('чл. 6(1)(е)'));
  // Език без човешки превод → английски.
  assert.match(autoTranslateNoticeEmail({ locale: 'fi', slugs: ['a'], startsAt: start, baseUrl: 'https://x' }).subject, /^Change at Linketto/);
});

import { AUTO_MAX_LINKS } from '../auto-translate';

test('profileSource: над тавана (блокове или знаци) → без автоматичен превод', () => {
  const many = Array.from({ length: AUTO_MAX_LINKS + 1 }, (_, i) => ({
    id: `l${i}`,
    translations: [{ id: `x${i}`, linkId: `l${i}`, locale: 'bg', title: `Линк ${i}` }],
  }));
  assert.equal(profileSource({ ...profile, links: many }), null);
  const huge = [{ id: 'l1', translations: [{ id: 'x1', linkId: 'l1', locale: 'bg', title: 'я'.repeat(9000) }] }];
  assert.equal(profileSource({ ...profile, links: huge }), null);
  assert.ok(profileSource(profile));
});
