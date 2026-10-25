import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { translatorFor } from '../src/i18n.js';
import { HIGHLIGHT_MULTI_MAX, highlightsView } from '../src/routes/match-view.js';
import { PLAYER_ID, decode, fakeRepo, sampleData, sampleHighlights, start } from './helpers.js';

test('§13: хайлайтите на мача — серии, колекцията, най-далечното; скритият е без линк', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const html = decode(await (await app.get('/bg/match/41')).text());
    assert.ok(html.includes('id="hl-title"'));
    assert.ok(html.includes('4K') && html.includes('3K'));
    assert.ok(html.includes('на 12:31 от началото'));
    assert.ok(html.includes('Без мерник') && html.includes('През дим'));
    assert.ok(html.includes('52,3 м') && html.includes('AWP'));
    assert.ok(html.includes(`href="/bg/match/41/player/${PLAYER_ID}"`), 'линк към отчета');
    assert.ok(
      html.includes('href="/bg/match/41/player/76561198000000002"'),
      'видимият играч от таблицата има отчет',
    );
    assert.ok(!html.includes('/player/null'), 'скритият няма линк');
    const none = await start({ repo: fakeRepo({ ...sampleData(), highlights: {} }) });
    try {
      const empty = decode(await (await none.get('/en/match/41')).text());
      assert.ok(empty.includes('No kill details were recorded for this match.'));
    } finally {
      await none.close();
    }
  } finally {
    await app.close();
  }
});

test('изгледът на хайлайтите: скрит → „скрит играч“, оръжията с показни имена, таван на сериите', () => {
  const t = translatorFor('bg');
  const data = sampleHighlights();
  data.multiKills = Array.from({ length: HIGHLIGHT_MULTI_MAX + 3 }, (_, i) => ({
    steamId: null,
    name: null,
    kills: 3,
    offsetMs: i * 1000,
    weapons: ['knife', 'knife_t', 'weapon_ak47'],
  }));
  const view = highlightsView(data, t, 'bg');
  assert.equal(view.multiKills.length, HIGHLIGHT_MULTI_MAX);
  assert.equal(view.multiKills[0]?.name, 'Скрит играч');
  assert.equal(view.multiKills[0]?.weapons, 'Knife, AK-47');
  assert.equal(view.collections[0]?.leader.steamId, null);
  assert.equal(view.longest?.meters, '52,3');
  assert.equal(view.gapSeconds, 10);
});
