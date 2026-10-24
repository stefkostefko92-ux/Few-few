/**
 * Панелът срещу истинската база и Redis: какво не вижда помощникът, роли (само под своята, OWNER
 * не се пипа, `reload` към плъгина), VIP нива и дарения (цели евроцентове) и чл. 21.
 * Тестови SteamID-та 76561190000993xxx и VIP нива `it-adm-*`; чисти ги преди и след себе си.
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
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
  type Received,
} from './admin-harness.js';
import { decode } from './helpers.js';

const ADMIN = '76561190000993001';
const HEAD = '76561190000993002';
const OWNER = '76561190000993003';
const HELPER = '76561190000993004';
const TARGET = '76561190000993005';
const IDS = [ADMIN, HEAD, OWNER, HELPER, TARGET];

const result = (response: Response) =>
  new URL(response.headers.get('location') ?? '', 'http://x').searchParams.get('r');

describe('панел: роли, VIP, чл. 21', { skip: enabled ? false : 'няма DATABASE_URL' }, () => {
  let db: PrismaClient;
  let close: () => Promise<void> = async () => {};
  const closers: Array<() => void> = [];
  const as: Record<string, Browser> = {};
  let bridgeGot: Received[] = [];
  /** Одитът не се чисти (веригата) — проверките броят само редовете от това пускане. */
  const since = new Date();

  async function wipe(): Promise<void> {
    await cleanup(db, IDS);
    await db.vipTier.deleteMany({ where: { code: { startsWith: 'it-adm-' } } });
  }

  before(async () => {
    db = new PrismaClient();
    await wipe();
    await makePlayers(db, [
      { steamId: ADMIN, name: 'IT Admin', role: 'ADMIN' },
      { steamId: HEAD, name: 'IT Head', role: 'HEADADMIN' },
      { steamId: OWNER, name: 'IT Owner', role: 'OWNER' },
      { steamId: HELPER, name: 'IT Helper', role: 'HELPER' },
      { steamId: TARGET, name: 'IT Target', role: 'PLAYER' },
    ]);
    const bridgeKey = testKey();
    const plugin = await fakePeer(BRIDGE_CHANNELS, bridgeKey, () => ({ ok: true }));
    bridgeGot = plugin.received;
    const bridge = channel(BRIDGE_CHANNELS, bridgeKey);
    closers.push(plugin.close, bridge.close);
    const app = await panelApp({
      db,
      live: memoryLive([]),
      bridge: bridge.sender,
      agent: UNAVAILABLE,
    });
    close = app.close;
    for (const [name, steamId] of Object.entries({ ADMIN, HEAD, OWNER, HELPER })) {
      as[name] = new Browser(app.base);
      await enrol(as[name]!, steamId);
    }
  });

  after(async () => {
    await close();
    for (const fn of closers) fn();
    if (db) {
      await wipe();
      await db.$disconnect();
    }
  });

  test('помощникът: без VIP, банери, сървър, одит и без IP адресите на сесиите', async () => {
    await db.session.create({ data: { steamId: TARGET, ip: '198.51.100.77' } });
    for (const path of ['/admin/vip', '/admin/banners', '/admin/server', '/admin/audit']) {
      assert.equal((await as.HELPER!.get(path)).status, 403, path);
    }
    const helperView = await (await as.HELPER!.get(`/admin/players/${TARGET}`)).text();
    assert.ok(!helperView.includes('198.51.100.77'), 'IP — само за ADMIN+');
    assert.ok(
      (await (await as.ADMIN!.get(`/admin/players/${TARGET}`)).text()).includes('198.51.100.77'),
    );
    const hide = await as.HELPER!.send(`/admin/players/${TARGET}/hide`, { hidden: 'on' }, '/admin');
    assert.equal(hide.status, 403);
  });

  test('роли: главният админ дава до ADMIN; не над себе си, не на OWNER; ADMIN — изобщо не', async () => {
    const page = (id: string) => `/admin/players/${id}`;
    assert.equal(
      (await as.ADMIN!.send(`${page(HELPER)}/role`, { role: 'MODERATOR' }, page(HELPER))).status,
      403,
    );
    const promote = await as.HEAD!.send(
      `${page(HELPER)}/role`,
      { role: 'MODERATOR' },
      page(HELPER),
    );
    assert.equal(result(promote), 'saved');
    assert.equal(
      (await db.player.findUniqueOrThrow({ where: { steamId: HELPER } })).role,
      'MODERATOR',
    );
    assert.equal(await db.webSession.count({ where: { steamId: HELPER } }), 0, 'изход навсякъде');
    assert.deepEqual(bridgeGot.at(-1), { action: 'reload', args: { what: 'roles' }, actor: HEAD });
    const audit = await db.auditLog.findFirstOrThrow({
      orderBy: { id: 'desc' },
      where: { at: { gte: since }, action: 'role.change', targetSteamId: HELPER },
    });
    assert.deepEqual(audit.details, { from: 'HELPER', to: 'MODERATOR' });

    assert.equal(
      result(await as.HEAD!.send(`${page(HELPER)}/role`, { role: 'HEADADMIN' }, page(HELPER))),
      'denied',
    );
    assert.equal(
      result(await as.HEAD!.send(`${page(HELPER)}/role`, { role: 'VIP' }, page(HELPER))),
      'denied',
    );
    assert.equal(
      result(await as.HEAD!.send(`${page(HELPER)}/role`, { role: 'GOD' }, page(HELPER))),
      'invalid',
    );
    assert.equal(
      result(await as.HEAD!.send(`${page(OWNER)}/role`, { role: 'PLAYER' }, page(OWNER))),
      'immune',
    );
    assert.equal(
      result(await as.OWNER!.send(`${page(OWNER)}/role`, { role: 'PLAYER' }, page(OWNER))),
      'immune',
    );
    const html = await (await as.HEAD!.get(page(TARGET))).text();
    assert.match(html, /<option value="ADMIN"/);
    assert.doesNotMatch(html, /<option value="(HEADADMIN|OWNER|VIP)"/);
  });

  test('VIP нива: цена в цели евроцентове, уникален код, триене само на неизползвано', async () => {
    const create = (body: Record<string, string>) =>
      as.ADMIN!.send('/admin/vip/tiers', body, '/admin/vip');
    const tier = {
      code: 'it-adm-gold',
      name: 'IT Gold',
      price: '4,99',
      periodDays: '30',
      active: 'on',
    };
    assert.equal(result(await create(tier)), 'saved');
    assert.equal(result(await create(tier)), 'duplicate');
    assert.equal(result(await create({ ...tier, code: 'it-adm-bad', price: '4.999' })), 'invalid');
    const saved = await db.vipTier.findUniqueOrThrow({ where: { code: 'it-adm-gold' } });
    assert.equal(saved.priceCents, 499);
    const update = await as.ADMIN!.send(
      `/admin/vip/tiers/${saved.id}`,
      { ...tier, price: '5' },
      '/admin/vip',
    );
    assert.equal(result(update), 'saved');
    assert.equal((await db.vipTier.findUniqueOrThrow({ where: { id: saved.id } })).priceCents, 500);
    assert.ok(decode(await (await as.ADMIN!.get('/admin/vip')).text()).includes('5,00'));

    // Ръчно даване: второто започва след края на първото; отнемане; нивото вече е „в употреба“.
    const grant = (days: string) =>
      as.ADMIN!.send(
        `/admin/players/${TARGET}/vip`,
        { tierId: String(saved.id), days },
        `/admin/players/${TARGET}`,
      );
    assert.equal(result(await grant('30')), 'saved');
    assert.equal(result(await grant('10')), 'saved');
    const grants = await db.vipGrant.findMany({
      where: { steamId: TARGET },
      orderBy: { id: 'asc' },
    });
    assert.equal(grants.length, 2);
    assert.equal(grants[1]!.startsAt.getTime(), grants[0]!.endsAt.getTime());
    assert.equal(grants[0]!.grantedBy, ADMIN);
    assert.equal(grants[0]!.amountCents, null, 'ръчно — не е продажба');
    assert.deepEqual(bridgeGot.at(-1), { action: 'reload', args: { what: 'vip' }, actor: ADMIN });
    const revoke = await as.ADMIN!.send(
      `/admin/players/${TARGET}/vip/${grants[0]!.id}/revoke`,
      {},
      `/admin/players/${TARGET}`,
    );
    assert.equal(result(revoke), 'saved');
    assert.ok((await db.vipGrant.findUniqueOrThrow({ where: { id: grants[0]!.id } })).revokedAt);

    // VIP е козметика: на себе си — да (и формата се вижда в собствения профил); на по-висок — не.
    const own = decode(await (await as.OWNER!.get(`/admin/players/${OWNER}`)).text());
    assert.ok(own.includes(`action="/admin/players/${OWNER}/vip"`), 'формата в собствения профил');
    const self = await as.OWNER!.send(
      `/admin/players/${OWNER}/vip`,
      { tierId: String(saved.id), days: '7' },
      `/admin/players/${OWNER}`,
    );
    assert.equal(result(self), 'saved');
    const selfGrant = await db.vipGrant.findFirstOrThrow({ where: { steamId: OWNER } });
    assert.equal(selfGrant.grantedBy, OWNER);
    const up = await as.ADMIN!.send(
      `/admin/players/${OWNER}/vip`,
      { tierId: String(saved.id), days: '7' },
      `/admin/players/${OWNER}`,
    );
    assert.equal(result(up), 'immune');
    assert.equal(
      result(
        await as.ADMIN!.send(
          `/admin/players/${OWNER}/vip/${selfGrant.id}/revoke`,
          {},
          `/admin/players/${OWNER}`,
        ),
      ),
      'immune',
    );
    assert.equal(
      result(
        await as.OWNER!.send(
          `/admin/players/${OWNER}/vip/${selfGrant.id}/revoke`,
          {},
          `/admin/players/${OWNER}`,
        ),
      ),
      'saved',
    );
    // Ролите остават с immunity — на себе си не.
    assert.equal(
      result(
        await as.OWNER!.send(
          `/admin/players/${OWNER}/role`,
          { role: 'HELPER' },
          `/admin/players/${OWNER}`,
        ),
      ),
      'immune',
    );
    assert.equal(
      result(await as.ADMIN!.send(`/admin/vip/tiers/${saved.id}/delete`, {}, '/admin/vip')),
      'inUse',
    );
  });

  test('чл. 21: скриване от класациите — ADMIN+, с одит', async () => {
    const hide = await as.ADMIN!.send(
      `/admin/players/${TARGET}/hide`,
      { hidden: 'on' },
      `/admin/players/${TARGET}`,
    );
    assert.equal(result(hide), 'saved');
    assert.equal(
      (await db.player.findUniqueOrThrow({ where: { steamId: TARGET } })).hiddenFromLeaderboards,
      true,
    );
    assert.ok(
      await db.auditLog.findFirst({
        orderBy: { id: 'desc' },
        where: { at: { gte: since }, action: 'player.hide', targetSteamId: TARGET },
      }),
    );
    const show = await as.ADMIN!.send(
      `/admin/players/${TARGET}/hide`,
      {},
      `/admin/players/${TARGET}`,
    );
    assert.equal(result(show), 'saved');
    assert.equal(
      (await db.player.findUniqueOrThrow({ where: { steamId: TARGET } })).hiddenFromLeaderboards,
      false,
    );
  });
});
