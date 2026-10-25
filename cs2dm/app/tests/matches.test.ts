import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PLAYER_ID, decode, fakeRepo, sampleData, start } from './helpers.js';

test('§13: картата на мача — топ 3, скритият играч е без име и без линк', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const html = decode(await (await app.get('/bg/match/41')).text());
    assert.match(html, /<title>Мач №41 на de_dust2 — първи Sandstorm/);
    assert.ok(html.includes(`href="/bg/player/${PLAYER_ID}"`));
    assert.ok(html.includes('Скрит играч'));
    assert.equal((html.match(/href="\/bg\/player\//g) ?? []).length >= 2, true);
    assert.ok(!html.includes('null'), 'скритият няма SteamID в HTML');
    assert.ok(html.includes('×1,5') && html.includes('XP уикенд'));
    assert.ok(html.includes('AK-47'), 'оръжието с показното име');
    const it = decode(await (await app.get('/it/match/41')).text());
    assert.ok(it.includes('Giocatore nascosto') && it.includes('×1,5'));
  } finally {
    await app.close();
  }
});

test('§13: невалиден или непознат мач → 404 без заявка с боклук', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    for (const path of [
      '/bg/match/0',
      '/bg/match/041',
      '/bg/match/abc',
      '/en/match/999',
      '/bg/match/1e3',
    ]) {
      assert.equal((await app.get(path)).status, 404, path);
    }
    const root = await app.get('/match/41', { 'accept-language': 'it-IT' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/it/match/41');
    assert.equal((await app.get('/match/abc')).status, 404);
  } finally {
    await app.close();
  }
});

test('§13: последните мачове — на началото, в списъка и линк от класацията', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const home = decode(await (await app.get('/en/')).text());
    assert.ok(home.includes('id="matches-title"') && home.includes('href="/en/match/41"'));
    const list = decode(await (await app.get('/en/matches')).text());
    assert.ok(
      list.includes('Match #41') && list.includes('Sandstorm') && list.includes('20 kills'),
    );
    const board = decode(await (await app.get('/bg/leaderboard')).text());
    assert.ok(board.includes('href="/bg/matches"'));
    const empty = await start({ repo: fakeRepo({ ...sampleData(), matches: [] }) });
    try {
      assert.ok(!(await (await empty.get('/bg/')).text()).includes('matches-title'));
      assert.ok(
        (await (await empty.get('/bg/matches')).text()).includes('Още няма завършени мачове'),
      );
    } finally {
      await empty.close();
    }
  } finally {
    await app.close();
  }
});
