/**
 * Живите настройки (§11) срещу истинската база и Redis: права (HEADADMIN+), строга форма, одит с
 * before/after, `settings.reload` към двойник на плъгина (подписан, с отговор), „По подразбиране“.
 * Тестови SteamID-та 76561190000996xxx. Редовете в server_settings се пазят и връщат след теста.
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient, type Prisma } from '@prisma/client';
import { BRIDGE_CHANNELS, UNAVAILABLE } from '../src/admin/commands.js';
import {
  Browser,
  channel,
  cleanup,
  enabled,
  enrol,
  fakePeer,
  makePlayers,
  memoryLive,
  panelApp,
  testKey,
  type Answer,
  type Received,
} from './admin-harness.js';

const ADMIN = '76561190000996001';
const HEAD = '76561190000996002';
const IDS = [ADMIN, HEAD];

const result = (response: Response) =>
  new URL(response.headers.get('location') ?? '', 'http://x').searchParams.get('r');

describe('панел: живи настройки', { skip: enabled ? false : 'няма DATABASE_URL' }, () => {
  let db: PrismaClient;
  let close: () => Promise<void> = async () => {};
  const closers: Array<() => void> = [];
  const as: Record<string, Browser> = {};
  let got: Received[] = [];
  let answer: (command: Received) => Answer = () => ({ ok: true });
  let saved: Array<{ key: string; value: Prisma.JsonValue; updatedBy: string | null }> = [];
  const since = new Date();

  before(async () => {
    db = new PrismaClient();
    saved = await db.serverSetting.findMany({
      select: { key: true, value: true, updatedBy: true },
    });
    await db.serverSetting.deleteMany();
    await cleanup(db, IDS);
    await makePlayers(db, [
      { steamId: ADMIN, name: 'IT Admin', role: 'ADMIN' },
      { steamId: HEAD, name: 'IT Head', role: 'HEADADMIN' },
    ]);
    const key = testKey();
    const plugin = await fakePeer(BRIDGE_CHANNELS, key, (command) => answer(command));
    got = plugin.received;
    const bridge = channel(BRIDGE_CHANNELS, key);
    closers.push(plugin.close, bridge.close);
    const app = await panelApp({
      db,
      live: memoryLive([]),
      bridge: bridge.sender,
      agent: UNAVAILABLE,
    });
    close = app.close;
    for (const [name, steamId] of Object.entries({ ADMIN, HEAD })) {
      as[name] = new Browser(app.base);
      await enrol(as[name]!, steamId);
    }
  });

  after(async () => {
    await close();
    for (const fn of closers) fn();
    if (db) {
      await db.serverSetting.deleteMany();
      for (const row of saved) {
        await db.serverSetting.create({
          data: {
            key: row.key,
            value: row.value as Prisma.InputJsonValue,
            updatedBy: row.updatedBy,
          },
        });
      }
      await cleanup(db, IDS);
      await db.$disconnect();
    }
  });

  test('само HEADADMIN+: ADMIN получава 403 и на страницата, и на записа', async () => {
    assert.equal((await as.ADMIN!.get('/admin/settings')).status, 403);
    const csrf = await as.ADMIN!.csrf();
    assert.equal(
      (await as.ADMIN!.post('/admin/settings/bots', { _csrf: csrf, quota: '4' })).status,
      403,
    );
    assert.equal(await db.serverSetting.count(), 0);
    const page = await (await as.HEAD!.get('/admin/settings')).text();
    assert.ok(page.includes('name="quota"') && page.includes('name="bg_0"'));
  });

  test('запис: одит с before/after и settings.reload с отговор → „sent“', async () => {
    const send = (body: Record<string, string>) =>
      as.HEAD!.send('/admin/settings/bots', body, '/admin/settings');
    assert.equal(result(await send({ quota: '17' })), 'invalid');
    assert.equal(result(await send({ quota: '4' })), 'sent');
    assert.deepEqual((await db.serverSetting.findUniqueOrThrow({ where: { key: 'bots' } })).value, {
      quota: 4,
    });
    assert.deepEqual(got.at(-1), { action: 'settings.reload', args: {}, actor: HEAD });
    assert.equal(result(await send({ quota: '8' })), 'sent');
    const audit = await db.auditLog.findMany({
      where: { action: 'settings.change', actorSteamId: HEAD, at: { gte: since } },
      orderBy: { id: 'asc' },
    });
    assert.deepEqual(
      audit.map((row) => row.details),
      [
        { key: 'bots', before: null, after: { quota: 4 } },
        { key: 'bots', before: { quota: 4 }, after: { quota: 8 } },
      ],
    );
    // Същата стойност наново — без нов одит, но командата пак отива (принудително прилагане).
    assert.equal(result(await send({ quota: '8' })), 'sent');
    assert.equal(
      await db.auditLog.count({
        where: { action: 'settings.change', actorSteamId: HEAD, at: { gte: since } },
      }),
      2,
    );
  });

  test('рекламите: текстовете се чистят; без отговор от плъгина → „recordedNoAck“', async () => {
    answer = () => null;
    const response = await as.HEAD!.send(
      '/admin/settings/adverts',
      { intervalSec: '600', b_site: 'on', bg_0: 'Влез в {Red}Discord', en_2: 'Join Discord' },
      '/admin/settings',
    );
    assert.equal(result(response), 'recordedNoAck');
    answer = () => ({ ok: true });
    assert.deepEqual(
      (await db.serverSetting.findUniqueOrThrow({ where: { key: 'adverts' } })).value,
      {
        intervalSec: 600,
        builtin: { carbonstealth: false, adblock: false, site: true },
        custom: { bg: ['Влез в (Red)Discord'], en: ['Join Discord'] },
      },
    );
    const page = await (await as.HEAD!.get('/admin/settings')).text();
    assert.ok(page.includes('value="Влез в (Red)Discord"'));
  });

  test('„По подразбиране“ трие реда (важи конфигът на плъгина) и е в одита', async () => {
    assert.equal(
      result(await as.HEAD!.send('/admin/settings/bots', { op: 'reset' }, '/admin/settings')),
      'sent',
    );
    assert.equal(await db.serverSetting.count({ where: { key: 'bots' } }), 0);
    const last = await db.auditLog.findFirstOrThrow({
      where: { action: 'settings.change', actorSteamId: HEAD, at: { gte: since } },
      orderBy: { id: 'desc' },
    });
    assert.deepEqual(last.details, { key: 'bots', before: { quota: 8 }, after: null });
    assert.equal(
      result(await as.HEAD!.send('/admin/settings/nope', { quota: '1' }, '/admin/settings')),
      'invalid',
    );
  });
});
