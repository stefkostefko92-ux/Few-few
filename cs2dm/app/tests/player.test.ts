import './env.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { safeAvatar } from '../src/routes/pages.js';
import { displayName, parseSteamId, steamId64 } from '../src/steamid.js';
import { PLAYER_ID, fakeRepo, sampleData, start } from './helpers.js';

test('zod приема само SteamID64 на акаунт: ^7656119\\d{10}$', () => {
  assert.equal(parseSteamId('76561198000000001'), '76561198000000001');
  assert.equal(parseSteamId('76561190000000000'), '76561190000000000');
  for (const bad of [
    '123',
    '7656119800000000',
    '765611980000000011',
    '86561198000000001',
    '7656119800000000a',
    ' 76561198000000001',
    '76561198000000001\n',
    '',
    null,
    undefined,
    76561198000000001,
    ['76561198000000001'],
  ]) {
    assert.equal(parseSteamId(bad), null, `прие ${JSON.stringify(bad)}`);
    assert.equal(steamId64.safeParse(bad).success, false);
  }
});

test('невалиден SteamID → 404, без да стигне до базата', async () => {
  const calls: string[] = [];
  const app = await start({ repo: fakeRepo(sampleData(), calls) });
  try {
    for (const bad of ['123', 'abc', '765611980000000011', '86561198000000001', '%00', "1'or'1"]) {
      const response = await app.get(`/bg/player/${bad}`);
      assert.equal(response.status, 404, bad);
      assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/);
    }
    assert.deepEqual(calls, [], 'репото не бива да се пита за невалиден идентификатор');
    // Валиден формат, но непознат играч → 404 след проверка в базата.
    assert.equal((await app.get('/en/player/76561190000000000')).status, 404);
    assert.deepEqual(calls, ['player:76561190000000000']);
  } finally {
    await app.close();
  }
});

test('профилът: ниво, K/D, точност, майсторство, heatmap SVG без изображения', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const response = await app.get(`/en/player/${PLAYER_ID}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<h1 class="profile-name">Sandstorm<\/h1>/);
    assert.match(html, /Level 11/, '6200 XP → ниво 11');
    assert.match(html, /2\.10/, 'K/D 420/200');
    assert.match(html, /32\.5%/, 'точност 1300/4000');
    assert.match(html, /badge-gold/, 'AK-47 с 1600 убийства = Gold');
    assert.equal((html.match(/<th scope="row">Knife<\/th>/g) ?? []).length, 1, 'ножовете са слети');
    assert.match(html, /<progress id="level-progress" max="100" value="\d+">/);
    assert.equal(
      (html.match(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="heatmap/g) ?? []).length,
      2,
    );
    assert.equal((html.match(/class="hm-cell"/g) ?? []).length, 3);
    assert.doesNotMatch(html, /<img\b/, 'без аватар в базата няма изображение');
    assert.doesNotMatch(html, /<image\b/);
    assert.match(html, /https:\/\/steamcommunity\.com\/profiles\/76561198000000001/);
  } finally {
    await app.close();
  }
});

test('профилът: отличията (§15) — значката с брой и рекорд, дуелите, празно без значки', async () => {
  const data = sampleData();
  data.honors = {
    badges: [
      { kind: 'zone_king', count: 3, lastAt: new Date('2026-10-24T18:00:00Z'), bestKills: 7 },
    ],
    duels: { wins: 4, losses: 2, draws: 1 },
  };
  const app = await start({ repo: fakeRepo(data) });
  const empty = await start({ repo: fakeRepo(sampleData()) });
  try {
    const html = await (await app.get(`/bg/player/${PLAYER_ID}`)).text();
    assert.match(html, /<h2 id="honors-title">Отличия<\/h2>/);
    assert.match(html, /badge-zone_king/);
    assert.match(html, /Крал на зоната/);
    assert.match(html, /<strong>3 пъти<\/strong>/);
    assert.match(html, /рекорд: 7 убийства в зоната/);
    assert.match(html, /<dt>Победи<\/dt><dd>4<\/dd>/);
    assert.match(html, /<dt>Загуби<\/dt><dd>2<\/dd>/);
    assert.match(html, /<dt>Равни<\/dt><dd>1<\/dd>/);
    assert.match(html, /Дуели за последните 90 дни/);
    const none = await (await empty.get(`/en/player/${PLAYER_ID}`)).text();
    assert.match(none, /No honours yet/);
    assert.doesNotMatch(none, /badge-zone_king/);
  } finally {
    await app.close();
    await empty.close();
  }
});

test('аватар само от CDN-а на Steam по HTTPS', async () => {
  assert.equal(
    safeAvatar('https://avatars.steamstatic.com/abc_full.jpg'),
    'https://avatars.steamstatic.com/abc_full.jpg',
  );
  assert.equal(safeAvatar('http://avatars.steamstatic.com/abc.jpg'), null);
  assert.equal(safeAvatar('https://evil.example/abc.jpg'), null);
  assert.equal(safeAvatar('javascript:alert(1)'), null);
  assert.equal(safeAvatar(null), null);

  const data = sampleData();
  data.players = data.players.map((p) => ({
    ...p,
    avatarUrl: 'https://avatars.steamstatic.com/abc_full.jpg',
  }));
  const app = await start({ repo: fakeRepo(data) });
  try {
    const html = await (await app.get(`/bg/player/${PLAYER_ID}`)).text();
    const img = /<img\b[^>]*>/.exec(html)?.[0] ?? '';
    assert.match(img, /src="https:\/\/avatars\.steamstatic\.com\/abc_full\.jpg"/);
    assert.match(img, /width="96" height="96"/);
    assert.match(img, /loading="lazy"/);
    assert.match(img, /referrerpolicy="no-referrer"/);
  } finally {
    await app.close();
  }
});

test('името от играта се чисти от контролни и посочни знаци', () => {
  assert.equal(displayName('\u202eevil\u202c name\u0007', '7656'), 'evil name');
  assert.equal(displayName('\u200b\u200b', '76561198000000001'), '76561198000000001');
});

test('името се екранира в HTML и в JSON-LD', async () => {
  const data = sampleData();
  data.players = data.players.map((p) => ({ ...p, name: '</script><script>alert(1)</script>' }));
  const app = await start({ repo: fakeRepo(data) });
  try {
    const html = await (await app.get(`/bg/player/${PLAYER_ID}`)).text();
    assert.doesNotMatch(html, /<script>alert/);
    assert.equal(
      (html.match(/<\/script>/g) ?? []).length,
      2,
      'само затварянията на нашите два скрипта',
    );
  } finally {
    await app.close();
  }
});
