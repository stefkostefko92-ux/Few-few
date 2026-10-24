import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eventFromForm } from '../src/admin/event-form.js';
import { formatMultiplier, utcToZonedInput, zonedToUtc, type PublicEvent } from '../src/events.js';
import { translatorFor } from '../src/i18n.js';
import { eventNodes, eventViews } from '../src/routes/event-seo.js';
import { LIVE_KNOWN, fakeRepo, fixedLive, sampleData, start } from './helpers.js';

const TZ = 'Europe/Sofia';
const NOW = new Date('2026-10-24T10:00:00Z');

test('§12: местно време ↔ UTC в зоната на сайта, вкл. лятно/зимно и несъществуващ час', () => {
  assert.equal(zonedToUtc('2026-07-01T12:00', TZ)?.toISOString(), '2026-07-01T09:00:00.000Z');
  assert.equal(zonedToUtc('2026-12-01T12:00', TZ)?.toISOString(), '2026-12-01T10:00:00.000Z');
  assert.equal(zonedToUtc('2026-03-29T03:30', TZ), null, 'пролетното превключване');
  assert.equal(zonedToUtc('2026-02-31T10:00', TZ), null);
  assert.equal(zonedToUtc('2026-07-01 12:00', TZ), null);
  assert.equal(utcToZonedInput(new Date('2026-07-01T09:00:00Z'), TZ), '2026-07-01T12:00');
});

test('§12: множителят за показ — от десети, по езика', () => {
  assert.equal(formatMultiplier(15, ','), '×1,5');
  assert.equal(formatMultiplier(20, '.'), '×2');
});

const form = {
  kind: 'XP_BOOST',
  titleBg: ' XP {Red}уикенд ',
  titleEn: 'XP weekend',
  titleIt: 'Weekend XP',
  startsAt: '2026-10-24T14:00',
  endsAt: '2026-10-26T23:00',
  xpMultiplier: '1,5',
  dmModeId: '',
};

test('§12: формата на събитие — проверки по вид, време и режим', () => {
  const ok = eventFromForm(form, TZ, NOW);
  assert.deepEqual(ok && { ...ok, startsAt: ok.startsAt.toISOString() }, {
    kind: 'XP_BOOST',
    titleBg: 'XP (Red)уикенд',
    titleEn: 'XP weekend',
    titleIt: 'Weekend XP',
    startsAt: '2026-10-24T11:00:00.000Z',
    endsAt: new Date('2026-10-26T21:00:00Z'),
    xpTenths: 15,
    dmModeId: null,
  });
  const bad: Array<Record<string, string>> = [
    { xpMultiplier: '1' },
    { kind: 'MODE' },
    { kind: 'MODE', dmModeId: '99' },
    { endsAt: '2026-10-24T13:00' },
    { startsAt: '2026-10-20T10:00', endsAt: '2026-10-24T09:00' },
    { endsAt: '2026-11-24T10:00' },
    { titleEn: '   ' },
    { kind: 'PARTY' },
  ];
  for (const change of bad) {
    assert.equal(eventFromForm({ ...form, ...change }, TZ, NOW), null, JSON.stringify(change));
  }
  assert.equal(eventFromForm({ ...form, kind: 'MODE', dmModeId: '1' }, TZ, NOW)?.dmModeId, 1);
  assert.equal(
    eventFromForm({ ...form, kind: 'COMMUNITY', xpMultiplier: '1' }, TZ, NOW)?.xpTenths,
    10,
  );
});

const EVENTS: PublicEvent[] = [
  {
    id: 7,
    kind: 'XP_BOOST',
    titles: { bg: 'XP уикенд', en: 'XP weekend', it: 'Weekend XP' },
    startsAt: new Date('2026-10-24T09:00:00Z'),
    endsAt: new Date('2026-10-26T21:00:00Z'),
    xpTenths: 20,
    modeName: null,
  },
  {
    id: 8,
    kind: 'MODE',
    titles: { bg: 'Само Deagle', en: 'Deagle only', it: 'Solo Deagle' },
    startsAt: new Date('2026-10-30T18:00:00Z'),
    endsAt: new Date('2026-10-30T20:00:00Z'),
    xpTenths: 10,
    modeName: 'Only Deagle',
  },
];

test('§12: JSON-LD Event за текущото и предстоящите', () => {
  const nodes = eventNodes(eventViews(EVENTS, 'it', NOW), 'it', translatorFor('it'));
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0]?.['@type'], 'Event');
  assert.equal(nodes[0]?.name, 'Weekend XP');
  assert.equal(nodes[0]?.eventAttendanceMode, 'https://schema.org/OnlineEventAttendanceMode');
  assert.match(String(nodes[0]?.description), /×2/);
  assert.match(String(nodes[1]?.description), /Only Deagle/);
});

test('§12: началната страница показва събитията и ги описва в JSON-LD', async () => {
  const app = await start({
    repo: fakeRepo({ ...sampleData(), events: EVENTS }),
    live: fixedLive(LIVE_KNOWN),
    now: () => NOW,
  });
  try {
    const html = await (await app.get('/bg/')).text();
    assert.ok(html.includes('id="events-title"') && html.includes('XP уикенд'));
    assert.ok(html.includes('class="ev is-live"'), 'текущото е „на живо“');
    assert.ok(html.includes('×2'));
    assert.ok(html.includes('"@type":"Event"') && html.includes('#event-8'));
    const empty = await start({ repo: fakeRepo(sampleData()), live: fixedLive(LIVE_KNOWN) });
    try {
      const plain = await (await empty.get('/en/')).text();
      assert.ok(!plain.includes('events-title') && !plain.includes('"@type":"Event"'));
    } finally {
      await empty.close();
    }
  } finally {
    await app.close();
  }
});
