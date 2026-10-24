import './env.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PUBLIC_BAN_SELECT, activeBanWhere } from '../src/data/prisma-repo.js';
import type { PublicBan } from '../src/data/repo.js';
import { fakeRepo, sampleData, start } from './helpers.js';

const SECRET_REASON = 'ВЪТРЕШНА-ПРИЧИНА-7f3a: wallhack доказан с демо 42';
const SECRET_IP = '203.0.113.77';
const SECRET_ADMIN = '76561198999999999';

/**
 * Репото връща ред с ВСИЧКИ вътрешни полета (както би станало при грешка в заявката) —
 * страницата пак не бива да покаже нито едно от тях.
 */
function leakyBan(): PublicBan {
  const row = {
    steamId: '76561198000000042',
    targetName: 'Cheater42',
    category: 'CHEATING' as const,
    createdAt: new Date('2026-10-20T10:00:00Z'),
    expiresAt: null,
    reason: SECRET_REASON,
    ip: SECRET_IP,
    actorSteamId: SECRET_ADMIN,
    revokeReason: SECRET_REASON,
  };
  return row;
}

test('банлистът никога не рендерира причина, IP или админ — дори репото да ги върне', async () => {
  const data = sampleData();
  data.bans = [
    leakyBan(),
    {
      steamId: '76561198000000043',
      targetName: 'Spammer',
      category: 'SPAM',
      createdAt: new Date('2026-10-21T10:00:00Z'),
      expiresAt: new Date('2026-10-28T10:00:00Z'),
    },
  ];
  const app = await start({ repo: fakeRepo(data) });
  try {
    for (const path of ['/bg/bans', '/en/bans', '/it/bans', '/bg/', '/en/', '/it/']) {
      const html = await (await app.get(path)).text();
      assert.ok(html.includes('Cheater42'), `${path}: банът се вижда`);
      assert.ok(!html.includes('ВЪТРЕШНА-ПРИЧИНА'), `${path}: изтече причината`);
      assert.ok(!html.includes('wallhack доказан'), `${path}: изтече причината`);
      assert.ok(!html.includes(SECRET_IP), `${path}: изтече IP`);
      assert.ok(!html.includes(SECRET_ADMIN), `${path}: изтече админът`);
    }
    const bg = await (await app.get('/bg/bans')).text();
    assert.ok(bg.includes('76561198000000042'), 'SteamID64 е публичен');
    assert.ok(bg.includes('Читове'), 'категорията е преведена');
    assert.ok(bg.includes('завинаги'), 'безсрочният бан е „завинаги“');
    const en = await (await app.get('/en/bans')).text();
    assert.ok(en.includes('Cheating') && en.includes('permanent'));
    assert.ok(en.includes('/en/contact'), 'обжалването води към контакта');
  } finally {
    await app.close();
  }
});

test('заявката зарежда само петте публични полета (CONTRACT.md §2)', () => {
  assert.deepEqual(Object.keys(PUBLIC_BAN_SELECT).sort(), [
    'category',
    'createdAt',
    'expiresAt',
    'steamId',
    'targetName',
  ]);
  const source = readFileSync('src/data/prisma-repo.ts', 'utf8');
  const activeBans = source.slice(
    source.indexOf('async activeBans'),
    source.indexOf('async vipTiers'),
  );
  assert.match(activeBans, /select: PUBLIC_BAN_SELECT/);
  assert.doesNotMatch(activeBans, /reason/);
});

test('активен бан: BAN, неотменен, безсрочен или със срок в бъдещето', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  assert.deepEqual(activeBanWhere(now), {
    type: 'BAN',
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  });
});

test('шаблонът на банлиста не споменава вътрешните полета', () => {
  const view = readFileSync('views/bans.ejs', 'utf8');
  for (const field of ['reason', 'actor', 'ip', 'revoke', 'source']) {
    assert.doesNotMatch(view, new RegExp(`\\.${field}\\b`, 'i'), `шаблонът чете .${field}`);
  }
});
