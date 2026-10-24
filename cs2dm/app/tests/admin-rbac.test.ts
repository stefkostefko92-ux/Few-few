import './env.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import type { AdminCtx } from '../src/admin/context.js';
import { UNAVAILABLE } from '../src/admin/commands.js';
import { centsToInput, durationMs, euroToCents } from '../src/admin/forms.js';
import {
  CAPABILITIES,
  assignableRoles,
  canChangeRole,
  canEnterPanel,
  checkTargetAction,
  minRoleToPunish,
  minRoleToRevoke,
  outranks,
} from '../src/admin/rbac.js';
import { protectedRoutes } from '../src/admin/routes/index.js';
import { DM_MODES, parseAgentStatus, parseLogLines, redactLine } from '../src/admin/server-data.js';
import { fixedLive } from './helpers.js';

const DAY = 86_400_000;

test('§1: достъп до панела от HELPER нагоре', () => {
  assert.deepEqual(
    (['PLAYER', 'VIP', 'HELPER', 'MODERATOR', 'ADMIN', 'HEADADMIN', 'OWNER'] as const).map(
      canEnterPanel,
    ),
    [false, false, true, true, true, true, true],
  );
});

test('§1: наказания — kick/mute/gag/warn HELPER, silence и бан ≤ 7 дни MODERATOR, иначе ADMIN', () => {
  for (const type of ['KICK', 'WARN', 'MUTE', 'GAG'] as const) {
    assert.equal(minRoleToPunish(type, null), 'HELPER');
  }
  assert.equal(minRoleToPunish('SILENCE', DAY), 'MODERATOR');
  assert.equal(minRoleToPunish('BAN', 7 * DAY), 'MODERATOR');
  assert.equal(minRoleToPunish('BAN', 7 * DAY + 60_000), 'ADMIN');
  assert.equal(minRoleToPunish('BAN', null), 'ADMIN', 'завинаги = ADMIN');
  assert.equal(minRoleToRevoke('BAN'), 'ADMIN', 'unban');
  assert.equal(minRoleToRevoke('MUTE'), 'HELPER');
  assert.equal(minRoleToRevoke('SILENCE'), 'MODERATOR');
});

test('immunity: само върху по-ниско ниво — значи и не върху себе си и не върху OWNER', () => {
  assert.equal(checkTargetAction('MODERATOR', 'HELPER', 'HELPER'), null);
  assert.equal(checkTargetAction('MODERATOR', 'HELPER', 'MODERATOR'), 'immunity');
  assert.equal(checkTargetAction('HELPER', 'ADMIN', 'PLAYER'), 'role');
  assert.equal(outranks('OWNER', 'OWNER'), false);
  assert.equal(outranks('HEADADMIN', 'OWNER'), false);
});

test('роли: само под своята, без VIP и OWNER; OWNER не се пипа', () => {
  assert.deepEqual(assignableRoles('ADMIN'), [], 'ADMIN няма право на роли');
  assert.deepEqual(assignableRoles('HEADADMIN'), ['PLAYER', 'HELPER', 'MODERATOR', 'ADMIN']);
  assert.deepEqual(assignableRoles('OWNER'), [
    'PLAYER',
    'HELPER',
    'MODERATOR',
    'ADMIN',
    'HEADADMIN',
  ]);
  assert.equal(canChangeRole('HEADADMIN', 'HELPER', 'ADMIN'), null);
  assert.equal(canChangeRole('HEADADMIN', 'HELPER', 'HEADADMIN'), 'role');
  assert.equal(canChangeRole('HEADADMIN', 'HEADADMIN', 'PLAYER'), 'immunity');
  assert.equal(canChangeRole('OWNER', 'OWNER', 'PLAYER'), 'immunity');
  assert.equal(canChangeRole('ADMIN', 'PLAYER', 'HELPER'), 'role');
});

function ctx(): AdminCtx {
  return {
    db: {} as PrismaClient,
    live: {
      ...fixedLive({ known: false }),
      snapshot: async () => ({ status: { known: false }, players: null }),
    },
    bridge: UNAVAILABLE,
    agent: UNAVAILABLE,
    encKey: Buffer.alloc(32),
    steamFetch: async () => new Response(''),
    now: () => new Date(),
  };
}

/** Таблицата на правата по маршрут — всяка промяна тук е промяна на §1 и иска преглед. */
const EXPECTED: Record<string, keyof typeof CAPABILITIES> = {
  'get /': 'panel',
  'post /live/action': 'panel',
  'post /live/say': 'say',
  'post /live/mode': 'mode',
  'get /punishments': 'panel',
  'post /punishments': 'panel',
  'post /punishments/:id/revoke': 'panel',
  'get /players': 'panel',
  'get /players/:steamId': 'panel',
  'post /players/:steamId/role': 'roles',
  'post /players/:steamId/vip': 'vip',
  'post /players/:steamId/vip/:grantId/revoke': 'vip',
  'post /players/:steamId/hide': 'privacy',
  'post /players/:steamId/totp-reset': 'roles',
  'post /players/:steamId/logout': 'roles',
  'post /players/:steamId/stats/:seasonId': 'playerData',
  'post /players/:steamId/weapons/:seasonId': 'playerData',
  'post /players/:steamId/playtime': 'playerData',
  'post /players/:steamId/stats-reset': 'playerData',
  'get /players/:steamId/data': 'playerData',
  'get /reports': 'panel',
  'post /reports/:id': 'reportsHandle',
  'get /appeals': 'appeals',
  'post /appeals/:id': 'appeals',
  'get /vip': 'vip',
  'post /vip/tiers': 'vip',
  'post /vip/tiers/:id': 'vip',
  'post /vip/tiers/:id/delete': 'vip',
  'get /events': 'events',
  'post /events': 'events',
  'post /events/:id': 'events',
  'post /events/:id/cancel': 'events',
  'get /banners': 'banners',
  'post /banners/:id/delete': 'banners',
  'get /audit': 'audit',
  'get /server': 'serverRead',
  'get /server/logs': 'serverRead',
  'post /server/start': 'serverControl',
  'post /server/stop': 'serverControl',
  'post /server/restart': 'serverControl',
  'post /server/update': 'serverControl',
  'get /settings': 'settings',
  'post /settings/:group': 'settings',
  'get /account': 'panel',
  'post /account/recovery': 'panel',
  'post /account/logout-all': 'panel',
};

test('всеки защитен маршрут е с право — точно по таблицата', () => {
  const routes = protectedRoutes(ctx());
  const actual = Object.fromEntries(routes.map((r) => [`${r.method} ${r.path}`, r.cap]));
  assert.equal(routes.length, Object.keys(actual).length, 'няма дублирани маршрути');
  assert.deepEqual(actual, EXPECTED);
  assert.deepEqual(Object.fromEntries(Object.entries(CAPABILITIES)), {
    panel: 'HELPER',
    reportsHandle: 'MODERATOR',
    appeals: 'MODERATOR',
    say: 'MODERATOR',
    mode: 'ADMIN',
    events: 'ADMIN',
    vip: 'ADMIN',
    privacy: 'ADMIN',
    serverRead: 'ADMIN',
    serverControl: 'HEADADMIN',
    roles: 'HEADADMIN',
    banners: 'HEADADMIN',
    audit: 'HEADADMIN',
    settings: 'HEADADMIN',
    playerData: 'HEADADMIN',
  });
});

test('сроковете от формата: празно = завинаги, таван 10 години', () => {
  assert.equal(durationMs({ amount: undefined, unit: 'd' }), null);
  assert.equal(durationMs({ amount: 90, unit: 'm' }), 90 * 60_000);
  assert.equal(durationMs({ amount: 7, unit: 'd' }), 7 * DAY);
  assert.equal(durationMs({ amount: 3651, unit: 'd' }), undefined);
});

test('цени: евро от формата → цели евроцентове без float', () => {
  assert.equal(euroToCents('4,99'), 499);
  assert.equal(euroToCents('4.9'), 490);
  assert.equal(euroToCents('12'), 1200);
  assert.equal(euroToCents('0.07'), 7);
  assert.equal(euroToCents('19.999'), null);
  assert.equal(euroToCents('-1'), null);
  assert.equal(euroToCents('1e3'), null);
  assert.equal(centsToInput(499), '4.99');
  assert.equal(centsToInput(7), '0.07');
});

test('логовете от агента се редактират и тук: IP, GSLT, дълъг hex; часът остава', () => {
  const line =
    'L 10/24/2026 - 12:34:56: "A<2><[U:1:1]>" connected, address "203.0.113.9:27005" ' +
    'sv_setsteamaccount ABCDEF0123 key 0123456789abcdef0123456789abcdef and 2001:db8::1';
  const clean = redactLine(line);
  assert.ok(clean.includes('12:34:56'), 'часът не е IPv6');
  assert.ok(!clean.includes('203.0.113.9'));
  assert.ok(!clean.includes('ABCDEF0123'));
  assert.ok(!clean.includes('0123456789abcdef0123456789abcdef'));
  assert.ok(!clean.includes('2001:db8::1'));
  assert.deepEqual(parseLogLines({ source: 'css', lines: ['a 10.0.0.1'] }), ['a x.x.x.x']);
  assert.deepEqual(parseLogLines(['b']), ['b']);
  assert.equal(parseLogLines({ lines: 'x' }), null);
});

test('статусът на агента: since в ms, busy, повреден отговор → null', () => {
  const status = parseAgentStatus({
    active: true,
    state: 'active',
    since: 1_792_828_391_000,
    gameVersion: '1.41.1.6',
    modsLoaded: true,
    broken: null,
    busy: 'update',
  });
  assert.equal(status?.since?.getTime(), 1_792_828_391_000);
  assert.equal(status?.busy, 'update');
  assert.equal(status?.broken, null);
  assert.equal(parseAgentStatus({ active: 'yes' }), null);
});

test('режимите на DM съвпадат с „Custom Modes“ в Deathmatch.json', () => {
  const config = JSON.parse(readFileSync('../server/mods/config/Deathmatch.json', 'utf8')) as {
    'Custom Modes': Record<string, { Name: string }>;
  };
  assert.deepEqual(
    DM_MODES.map((mode) => ({ id: mode.id, name: mode.name })),
    Object.entries(config['Custom Modes']).map(([id, mode]) => ({
      id: Number(id),
      name: mode.Name,
    })),
  );
});
