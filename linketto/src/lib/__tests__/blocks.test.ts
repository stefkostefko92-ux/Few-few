import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVCard,
  isBlockVisible,
  parseBlockInput,
  pickAppTarget,
  pickMusicTarget,
  videoEmbedSrc,
} from '../blocks';

test('parseBlockInput: LINK изисква валиден http(s) URL', () => {
  assert.equal(
    parseBlockInput({ kind: 'LINK', url: 'https://a.bg', extra1: '', extra2: '' })?.url,
    'https://a.bg',
  );
  assert.equal(
    parseBlockInput({ kind: 'LINK', url: 'javascript:alert(1)', extra1: '', extra2: '' }),
    null,
  );
});

test('parseBlockInput: PHONE нормализира до tel:', () => {
  const block = parseBlockInput({
    kind: 'PHONE',
    url: '+359 877 414 874',
    extra1: '',
    extra2: '',
  });
  assert.equal(block?.url, 'tel:+359877414874');
});

test('parseBlockInput: MAP строи Google Maps URL', () => {
  const block = parseBlockInput({
    kind: 'MAP',
    url: 'ул. Самуил 3, Бобов дол',
    extra1: '',
    extra2: '',
  });
  assert.ok(block?.url?.startsWith('https://www.google.com/maps?q='));
});

test('parseBlockInput: APP иска поне един магазин', () => {
  assert.equal(
    parseBlockInput({ kind: 'APP', url: '', extra1: '', extra2: '' }),
    null,
  );
  const block = parseBlockInput({
    kind: 'APP',
    url: '',
    extra1: 'https://apps.apple.com/app/id1',
    extra2: 'https://play.google.com/store/apps/details?id=x',
    });
  assert.equal(block?.meta?.ios, 'https://apps.apple.com/app/id1');
});

test('parseBlockInput: HEADER/FORM нямат URL', () => {
  assert.deepEqual(
    parseBlockInput({ kind: 'HEADER', url: 'каквото-и-да-е', extra1: '', extra2: '' }),
    { kind: 'HEADER', url: null, meta: null },
  );
});

test('videoEmbedSrc: YouTube през nocookie + Vimeo', () => {
  assert.equal(
    videoEmbedSrc('https://www.youtube.com/watch?v=abc123'),
    'https://www.youtube-nocookie.com/embed/abc123',
  );
  assert.equal(
    videoEmbedSrc('https://youtu.be/abc123'),
    'https://www.youtube-nocookie.com/embed/abc123',
  );
  assert.equal(
    videoEmbedSrc('https://vimeo.com/12345'),
    'https://player.vimeo.com/video/12345',
  );
  assert.equal(videoEmbedSrc('https://example.com/watch?v=abc'), null);
});

test('pickAppTarget: iOS/Android детекция + fallback', () => {
  const meta = { ios: 'https://apple.example', android: 'https://play.example' };
  assert.equal(
    pickAppTarget('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', meta, null),
    'https://apple.example',
  );
  assert.equal(
    pickAppTarget('Mozilla/5.0 (Linux; Android 14)', meta, null),
    'https://play.example',
  );
  assert.equal(
    pickAppTarget('Mozilla/5.0 (Windows NT 10)', meta, 'https://site.example'),
    'https://site.example',
  );
  assert.equal(pickAppTarget('Mozilla/5.0 (Windows NT 10)', meta, null), 'https://apple.example');
});

test('pickMusicTarget: избор по услуга', () => {
  const meta = { spotify: 'https://s.example', apple: 'https://a.example' };
  assert.equal(pickMusicTarget('spotify', meta, null), 'https://s.example');
  assert.equal(pickMusicTarget('apple', meta, null), 'https://a.example');
  assert.equal(pickMusicTarget(null, meta, null), 'https://s.example');
});

test('parseBlockInput: VCARD иска телефон или имейл', () => {
  assert.equal(
    parseBlockInput({ kind: 'VCARD', url: '', extra1: '', extra2: '' }),
    null,
  );
  const block = parseBlockInput({
    kind: 'VCARD',
    url: '+359 877 414 874',
    extra1: 'info@carbonstealth.eu',
    extra2: 'Carbon Stealth VCC',
  });
  assert.equal(block?.meta?.phone, '+359877414874');
  assert.equal(block?.meta?.email, 'info@carbonstealth.eu');
  assert.equal(block?.meta?.org, 'Carbon Stealth VCC');
});

test('buildVCard: коректен формат и екраниране', () => {
  const card = buildVCard({
    name: 'Мария; Петрова',
    phone: '+359877414874',
    email: 'maria@example.com',
    org: 'ACME, Ltd',
    url: 'https://linketto.carbonstealth.eu/u/maria',
  });
  assert.ok(card.startsWith('BEGIN:VCARD\r\nVERSION:3.0'));
  assert.ok(card.includes('FN:Мария\\; Петрова'));
  assert.ok(card.includes('ORG:ACME\\, Ltd'));
  assert.ok(card.includes('TEL;TYPE=CELL:+359877414874'));
  assert.ok(card.endsWith('END:VCARD\r\n'));
});

test('isBlockVisible: прозорец от/до', () => {
  const now = new Date('2026-07-08T12:00:00Z');
  const past = new Date('2026-07-01T00:00:00Z');
  const future = new Date('2026-08-01T00:00:00Z');
  assert.ok(isBlockVisible({ showFrom: null, showUntil: null }, now));
  assert.ok(isBlockVisible({ showFrom: past, showUntil: future }, now));
  assert.ok(!isBlockVisible({ showFrom: future, showUntil: null }, now));
  assert.ok(!isBlockVisible({ showFrom: null, showUntil: past }, now));
});

test('parseBlockInput: spotlight (featured) влиза в meta само при поискване', () => {
  const featured = parseBlockInput({
    kind: 'LINK',
    url: 'https://example.com',
    extra1: '',
    extra2: '',
    featured: true,
  });
  assert.equal(featured?.meta?.featured, true);
  const plain = parseBlockInput({
    kind: 'LINK',
    url: 'https://example.com',
    extra1: '',
    extra2: '',
  });
  assert.equal(plain?.meta?.featured, undefined);
});
