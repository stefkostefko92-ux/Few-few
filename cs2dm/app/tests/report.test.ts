import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { compareWithBaseline } from '../src/routes/report-view.js';
import { PLAYER_ID, decode, fakeRepo, sampleData, sampleReport, start } from './helpers.js';

const REPORT = `/bg/match/41/player/${PLAYER_ID}`;

test('§13: личният отчет — резултат, сравнение, оръжия, серии, карта на смъртите; noindex', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const response = await app.get(REPORT);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
    const html = decode(await response.text());
    assert.match(html, /<h1[^>]*>Отчетът на Sandstorm<\/h1>/);
    assert.match(html, /<meta name="robots" content="noindex, follow">/);
    assert.ok(html.includes(`href="/bg/player/${PLAYER_ID}"`), 'линк към профила');
    assert.ok(html.includes('href="/bg/match/41"'), 'линк към мача');
    // Ножовете (knife + knife_t) са едно оръжие.
    assert.equal((html.match(/<th scope="row">Knife<\/th>/g) ?? []).length, 1);
    assert.ok(html.includes('4K') && html.includes('на 12:31 от началото'));
    assert.ok(html.includes('AK-47, Desert Eagle'));
    // 20 срещу 15,5 убийства → +4,5 (по-добре); 9 срещу 11 смърти → -2 (по-добре).
    assert.match(html, /delta delta-better">\+4,5</);
    assert.match(html, /delta delta-better">-2</);
    assert.ok(html.includes('Средното е от 3 мача през 7-те дни преди този.'));
    assert.ok(html.includes('id="hm-match-deaths-t"'), 'картата на смъртите');
    assert.ok(html.includes('4 смърти в мача; най-много в сектор'));
    const it = decode(await (await app.get(`/it/match/41/player/${PLAYER_ID}`)).text());
    assert.ok(it.includes('Il resoconto di Sandstorm') && it.includes('+4,5'));
    const en = decode(await (await app.get(`/en/match/41/player/${PLAYER_ID}`)).text());
    assert.ok(en.includes('pp') && en.includes('better than usual'));
  } finally {
    await app.close();
  }
});

test('§13: отчет за скрит/непознат играч или невалиден адрес → 404', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    for (const path of [
      '/bg/match/41/player/76561198000000002', // няма отчет (скрит или не е играл) → репото връща null
      '/bg/match/42/player/' + PLAYER_ID,
      '/bg/match/041/player/' + PLAYER_ID,
      '/bg/match/41/player/abc',
      '/bg/match/41/player/123',
    ]) {
      assert.equal((await app.get(path)).status, 404, path);
    }
  } finally {
    await app.close();
  }
});

test('§4: картата на смъртите излиза чак час след края на мача', async () => {
  const report = sampleReport();
  const early = new Date(report.match.endedAt.getTime() + 30 * 60_000);
  const app = await start({ repo: fakeRepo(sampleData()), now: () => early });
  try {
    const html = decode(await (await app.get(REPORT)).text());
    assert.ok(!html.includes('hm-match-deaths'), 'без карта преди закъснението');
    assert.ok(html.includes('Картата излиза 1 ч след края на мача.'));
  } finally {
    await app.close();
  }
});

test('§13: отчет без база за сравнение и без записани убийства', async () => {
  const report = {
    ...sampleReport(),
    baseline: null,
    recorded: false,
    weapons: [],
    multiKills: [],
    deathCells: [],
  };
  const app = await start({ repo: fakeRepo({ ...sampleData(), reports: [report] }) });
  try {
    const html = decode(await (await app.get(REPORT)).text());
    assert.ok(html.includes('Няма мачове през 7-те дни преди този'));
    assert.ok(html.includes('За този мач няма записани подробности за убийствата.'));
    assert.ok(!html.includes('compare-table'));
  } finally {
    await app.close();
  }
});

test('§13: профилът — последните мачове с линк към отчета', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const html = decode(await (await app.get(`/bg/player/${PLAYER_ID}`)).text());
    assert.ok(html.includes('id="recent-title"'));
    assert.ok(html.includes(`href="/bg/match/41/player/${PLAYER_ID}"`));
    assert.ok(html.includes('1 от 3'));
    const empty = await start({ repo: fakeRepo({ ...sampleData(), playerMatches: [] }) });
    try {
      const text = decode(await (await empty.get(`/bg/player/${PLAYER_ID}`)).text());
      assert.ok(text.includes('Още няма изигран мач в записа (пазим ги 90 дни).'));
    } finally {
      await empty.close();
    }
  } finally {
    await app.close();
  }
});

test('сравнението: посока по показател, K/D при 0 смърти, HS без убийства, равно при закръгляне', () => {
  const base = { matches: 2, kills: 10, deaths: 10, headshots: 5, xp: 100 };
  const rows = compareWithBaseline({ kills: 12, deaths: 0, headshots: 6, xp: 100 }, base);
  const by = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(by.kills?.tone, 'better');
  assert.equal(by.deaths?.tone, 'better', 'по-малко смърти е по-добре');
  assert.equal(by.kd?.value, 12, 'K/D при 0 смърти дели на 1');
  assert.equal(by.kd?.average, 1);
  assert.equal(by.hs?.value, 50);
  assert.equal(by.hs?.tone, 'even');
  assert.equal(by.xp?.tone, 'even');
  const worse = compareWithBaseline({ kills: 0, deaths: 14, headshots: 0, xp: 80 }, base);
  const w = Object.fromEntries(worse.map((row) => [row.id, row]));
  assert.equal(w.deaths?.tone, 'worse');
  assert.equal(w.hs?.value, null);
  assert.equal(w.hs?.tone, null, 'без убийства няма HS');
  // 10,04 срещу 10 → показва се „+0“ → равно.
  const near = compareWithBaseline(
    { kills: 10, deaths: 10, headshots: 5, xp: 100 },
    {
      ...base,
      kills: 9.96,
    },
  );
  assert.equal(near[0]?.tone, 'even');
});
