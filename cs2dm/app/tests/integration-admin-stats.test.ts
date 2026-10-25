/**
 * Редакторът на статистиките (§3, епоха) и „всичко, което пазим“ срещу истинската база и Redis:
 * права (HEADADMIN+, immunity), валидация, одит before/after, нова епоха на всички редове,
 * `player.reload` към двойник на плъгина, нулиране с потвърждение. SteamID-та 76561190000997xxx.
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

const HEAD = '76561190000997001';
const ADMIN = '76561190000997002';
const TARGET = '76561190000997003';
const OWNER = '76561190000997004';
const IDS = [HEAD, ADMIN, TARGET, OWNER];
const PROFILE = `/admin/players/${TARGET}`;

const result = (response: Response) =>
  new URL(response.headers.get('location') ?? '', 'http://x').searchParams.get('r');

const ROW = {
  kills: '100',
  deaths: '80',
  headshots: '40',
  assists: '10',
  damage: '9000',
  shotsFired: '2000',
  shotsHit: '600',
  bestStreak: '9',
  bountiesClaimed: '2',
  revenges: '3',
  playtimeSec: '3600',
  xp: '1500',
};

describe(
  'панел: статистики и данни на играч',
  { skip: enabled ? false : 'няма DATABASE_URL' },
  () => {
    let db: PrismaClient;
    let close: () => Promise<void> = async () => {};
    const closers: Array<() => void> = [];
    const as: Record<string, Browser> = {};
    let got: Received[] = [];
    let season = 0;
    const since = new Date();

    async function seed(): Promise<void> {
      await db.playerSeasonStats.deleteMany({ where: { steamId: TARGET } });
      await db.weaponSeasonStats.deleteMany({ where: { steamId: TARGET } });
      for (const seasonId of [0, season]) {
        await db.playerSeasonStats.create({
          data: {
            steamId: TARGET,
            seasonId,
            ...Object.fromEntries(
              Object.entries(ROW)
                .filter(([k]) => k !== 'xp')
                .map(([k, v]) => [k, Number(v)]),
            ),
            xp: 1500n,
          },
        });
        await db.weaponSeasonStats.create({
          data: { steamId: TARGET, seasonId, weapon: 'ak47', kills: 60, headshots: 30 },
        });
      }
    }

    before(async () => {
      db = new PrismaClient();
      await cleanup(db, IDS);
      await makePlayers(db, [
        { steamId: HEAD, name: 'IT Head', role: 'HEADADMIN' },
        { steamId: ADMIN, name: 'IT Admin', role: 'ADMIN' },
        { steamId: TARGET, name: 'IT Target', role: 'PLAYER' },
        { steamId: OWNER, name: 'IT Owner', role: 'OWNER' },
      ]);
      const current = await db.season.findFirst({
        where: { id: { gt: 0 }, endsAt: null },
        orderBy: { id: 'desc' },
      });
      season = current?.id ?? 1;
      await seed();
      const key = testKey();
      const plugin = await fakePeer(BRIDGE_CHANNELS, key, () => ({ ok: true }));
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
      for (const [name, steamId] of Object.entries({ HEAD, ADMIN })) {
        as[name] = new Browser(app.base);
        await enrol(as[name]!, steamId);
      }
    });

    after(async () => {
      await close();
      for (const fn of closers) fn();
      if (db) {
        await cleanup(db, IDS);
        await db.$disconnect();
      }
    });

    test('редакторът е само за HEADADMIN+ и само над целта', async () => {
      const asAdmin = await (await as.ADMIN!.get(PROFILE)).text();
      assert.ok(!asAdmin.includes('name="xp"'), 'ADMIN не вижда редактора');
      const csrf = await as.ADMIN!.csrf();
      assert.equal(
        (await as.ADMIN!.post(`${PROFILE}/stats/0`, { _csrf: csrf, ...ROW })).status,
        403,
      );
      assert.equal((await as.ADMIN!.get(`${PROFILE}/data`)).status, 403);
      const asHead = await (await as.HEAD!.get(PROFILE)).text();
      assert.ok(asHead.includes('name="xp"') && asHead.includes(`/stats/${season}`));
      assert.equal(
        result(await as.HEAD!.send(`/admin/players/${OWNER}/stats/0`, ROW, PROFILE)),
        'immune',
      );
    });

    test('запис: нова епоха на всички редове, одит before/after, player.reload', async () => {
      const send = (body: Record<string, string>) =>
        as.HEAD!.send(`${PROFILE}/stats/0`, body, PROFILE);
      assert.equal(result(await send({ ...ROW, headshots: '101' })), 'invalid', 'HS > убийства');
      assert.equal(result(await send({ ...ROW, kills: '-1' })), 'invalid');
      assert.equal(result(await send({ ...ROW, xp: '1e3' })), 'invalid');
      assert.equal(result(await send(ROW)), 'saved', 'без промяна');
      assert.equal(
        (await db.player.findUniqueOrThrow({ where: { steamId: TARGET } })).statsEpoch,
        0,
      );

      assert.equal(result(await send({ ...ROW, kills: '50', headshots: '20', xp: '10' })), 'sent');
      const row = await db.playerSeasonStats.findUniqueOrThrow({
        where: { steamId_seasonId: { steamId: TARGET, seasonId: 0 } },
      });
      assert.equal(row.kills, 50);
      assert.equal(row.xp, 10n);
      assert.equal(row.playtimeSec, 3600, 'непроменено поле остава');
      const epochs = [
        (await db.player.findUniqueOrThrow({ where: { steamId: TARGET } })).statsEpoch,
        ...(await db.playerSeasonStats.findMany({ where: { steamId: TARGET } })).map(
          (r) => r.statsEpoch,
        ),
        ...(await db.weaponSeasonStats.findMany({ where: { steamId: TARGET } })).map(
          (r) => r.statsEpoch,
        ),
      ];
      assert.deepEqual(new Set(epochs), new Set([1]), 'една епоха навсякъде');
      assert.deepEqual(got.at(-1), {
        action: 'player.reload',
        args: { steamId: TARGET },
        actor: HEAD,
      });
      const audit = await db.auditLog.findFirstOrThrow({
        where: { action: 'stats.edit', targetSteamId: TARGET, at: { gte: since } },
        orderBy: { id: 'desc' },
      });
      const details = audit.details as Record<string, Record<string, unknown>>;
      assert.deepEqual(details.before, { kills: 100, headshots: 40, xp: '1500' });
      assert.deepEqual(details.after, { kills: 50, headshots: 20, xp: '10' });
      assert.equal(details.after?.xp, '10');
    });

    test('оръжие и изиграно време: свой одит; непознато оръжие → notFound', async () => {
      assert.equal(
        result(
          await as.HEAD!.send(
            `${PROFILE}/weapons/0`,
            { weapon: 'ak47', kills: '61', headshots: '31' },
            PROFILE,
          ),
        ),
        'sent',
      );
      assert.equal(
        result(
          await as.HEAD!.send(
            `${PROFILE}/weapons/0`,
            { weapon: 'awp', kills: '1', headshots: '0' },
            PROFILE,
          ),
        ),
        'notFound',
      );
      assert.equal(
        result(
          await as.HEAD!.send(
            `${PROFILE}/weapons/0`,
            { weapon: '../x', kills: '1', headshots: '0' },
            PROFILE,
          ),
        ),
        'invalid',
      );
      assert.equal(
        result(await as.HEAD!.send(`${PROFILE}/playtime`, { playtimeSec: '7200' }, PROFILE)),
        'sent',
      );
      const player = await db.player.findUniqueOrThrow({ where: { steamId: TARGET } });
      assert.equal(player.playtimeSec, 7200);
      assert.equal(player.statsEpoch, 3, 'всяка редакция е нова епоха');
      const actions = await db.auditLog.findMany({
        where: { targetSteamId: TARGET, at: { gte: since }, action: { startsWith: 'stats.' } },
        select: { action: true },
      });
      assert.deepEqual(actions.map((a) => a.action).sort(), [
        'stats.edit',
        'stats.playtime',
        'stats.weapon',
      ]);
    });

    test('нулиране: само с потвърждение; сезонът — само текущият; „всичко“ — и времето', async () => {
      const reset = (body: Record<string, string>) =>
        as.HEAD!.send(`${PROFILE}/stats-reset`, body, PROFILE);
      assert.equal(result(await reset({ scope: 'season' })), 'invalid', 'без потвърждение');
      assert.equal(result(await reset({ scope: 'season', confirm: 'on' })), 'sent');
      const rows = await db.playerSeasonStats.findMany({
        where: { steamId: TARGET },
        orderBy: { seasonId: 'asc' },
      });
      assert.equal(rows.find((r) => r.seasonId === season)?.kills, 0);
      assert.equal(rows.find((r) => r.seasonId === 0)?.kills, 50, 'сезон 0 остава');
      assert.equal(result(await reset({ scope: 'all', confirm: 'on' })), 'sent');
      const all = await db.playerSeasonStats.findMany({ where: { steamId: TARGET } });
      assert.ok(all.every((r) => r.kills === 0 && r.xp === 0n));
      assert.ok(
        (await db.weaponSeasonStats.findMany({ where: { steamId: TARGET } })).every(
          (w) => w.kills === 0,
        ),
      );
      assert.equal(
        (await db.player.findUniqueOrThrow({ where: { steamId: TARGET } })).playtimeSec,
        0,
      );
      assert.equal(result(await reset({ scope: 'all', confirm: 'on' })), 'saved', 'вече е нула');
      const audit = await db.auditLog.findFirstOrThrow({
        where: { action: 'stats.reset', targetSteamId: TARGET, at: { gte: since } },
        orderBy: { id: 'desc' },
      });
      const details = audit.details as { scope: string; before: { playtimeSec?: number } };
      assert.equal(details.scope, 'all');
      assert.equal(details.before.playtimeSec, 7200);
    });

    test('„всичко, което пазим“: сурови колони, без TOTP тайната', async () => {
      await db.player.update({
        where: { steamId: TARGET },
        data: { totpSecretEnc: 'enc-secret-x' },
      });
      const html = await (await as.HEAD!.get(`${PROFILE}/data`)).text();
      assert.ok(html.includes('stats_epoch') && html.includes('totp_secret_stored'));
      assert.ok(!html.includes('enc-secret-x') && !html.includes('totp_secret_enc'));
      assert.ok(html.includes('stats.reset'), 'одитът за играча');
    });
  },
);
