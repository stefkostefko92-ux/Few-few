/**
 * Панелът срещу истинската база: доклади от играта (помощникът чете, модераторът решава веднъж) и
 * обжалвания (уважено = отмяна на наказанието, затова се искат правата за отмяната му), плюс
 * командите slay/say/mode по моста — правата и аргументите им.
 * Тестови SteamID-та 76561190000994xxx; чисти ги преди и след себе си.
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
  livePlayer,
  makePlayers,
  memoryLive,
  panelApp,
  testKey,
  type Received,
} from './admin-harness.js';
import { decode } from './helpers.js';

const HELPER = '76561190000994001';
const MOD = '76561190000994002';
const ADMIN = '76561190000994003';
const TARGET = '76561190000994004';
const OTHER = '76561190000994007';
const IDS = [HELPER, MOD, ADMIN, TARGET, OTHER];
const SECRET = 'IT-CASES-REASON-41d0';

const result = (response: Response) =>
  new URL(response.headers.get('location') ?? '', 'http://x').searchParams.get('r');

describe(
  'панел: доклади, обжалвания, slay/say/mode',
  { skip: enabled ? false : 'няма DATABASE_URL' },
  () => {
    let db: PrismaClient;
    let close: () => Promise<void> = async () => {};
    const browsers: Record<string, Browser> = {};
    const closers: Array<() => void> = [];
    let received: Received[] = [];
    const last = () => received.at(-1);
    /** Одитът не се чисти (веригата) — проверките гледат само редовете от това пускане. */
    const since = new Date();

    before(async () => {
      db = new PrismaClient();
      await cleanup(db, IDS);
      await makePlayers(db, [
        { steamId: HELPER, name: 'IT Helper', role: 'HELPER' },
        { steamId: MOD, name: 'IT Mod', role: 'MODERATOR' },
        { steamId: ADMIN, name: 'IT Admin', role: 'ADMIN' },
        { steamId: TARGET, name: 'IT Target', role: 'PLAYER' },
        { steamId: OTHER, name: 'IT Offline', role: 'PLAYER' },
      ]);
      const key = testKey();
      const peer = await fakePeer(BRIDGE_CHANNELS, key, () => ({ ok: true }));
      received = peer.received;
      const bridge = channel(BRIDGE_CHANNELS, key);
      closers.push(peer.close, bridge.close);
      const live = memoryLive([livePlayer(TARGET, 'IT Target')]);
      const app = await panelApp({ db, live, bridge: bridge.sender, agent: UNAVAILABLE });
      close = app.close;
      for (const [id, steamId] of Object.entries({ HELPER, MOD, ADMIN })) {
        browsers[id] = new Browser(app.base);
        await enrol(browsers[id]!, steamId);
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

    test('доклади: помощникът чете, модераторът решава веднъж', async () => {
      const report = await db.report.create({
        data: {
          targetSteamId: TARGET,
          targetName: 'IT Target',
          reason: 'aimbot',
          source: 'GAME',
          reporterSteamId: OTHER,
        },
      });
      assert.ok((await (await browsers.HELPER!.get('/admin/reports')).text()).includes('aimbot'));
      assert.equal(
        (
          await browsers.HELPER!.send(
            `/admin/reports/${report.id}`,
            { status: 'ACCEPTED' },
            '/admin/reports',
          )
        ).status,
        403,
      );
      const handled = await browsers.MOD!.send(
        `/admin/reports/${report.id}`,
        { status: 'ACCEPTED', note: 'banned' },
        '/admin/reports',
      );
      assert.equal(result(handled), 'saved');
      const twice = await browsers.MOD!.send(
        `/admin/reports/${report.id}`,
        { status: 'REJECTED' },
        '/admin/reports',
      );
      assert.equal(result(twice), 'notActive');
      const row = await db.report.findUniqueOrThrow({ where: { id: report.id } });
      assert.equal(row.status, 'ACCEPTED');
      assert.equal(row.handledBy, MOD);
    });

    test('обжалване: уважено = отмяна, затова модераторът не може за бан; админът — да', async () => {
      const ban = await db.punishment.create({
        data: {
          type: 'BAN',
          steamId: OTHER,
          targetName: 'IT Offline',
          reason: SECRET,
          source: 'GAME',
          category: 'CHEATING',
        },
      });
      const appeal = await db.appeal.create({
        data: {
          punishmentId: ban.id,
          steamId: OTHER,
          message: 'IT appeal: not me',
          contact: 'it@example.invalid',
        },
      });
      assert.equal((await browsers.HELPER!.get('/admin/appeals')).status, 403);
      assert.ok(
        decode(await (await browsers.MOD!.get('/admin/appeals')).text()).includes(
          'IT appeal: not me',
        ),
      );
      const path = `/admin/appeals/${appeal.id}`;
      assert.equal(
        result(await browsers.MOD!.send(path, { status: 'ACCEPTED' }, '/admin/appeals')),
        'invalid',
        'без обосновка',
      );
      assert.equal(
        result(
          await browsers.MOD!.send(path, { status: 'ACCEPTED', note: 'ok' }, '/admin/appeals'),
        ),
        'denied',
      );
      assert.equal(
        (await db.appeal.findUniqueOrThrow({ where: { id: appeal.id } })).status,
        'OPEN',
      );
      assert.equal(
        result(
          await browsers.ADMIN!.send(
            path,
            { status: 'ACCEPTED', note: 'proof was wrong' },
            '/admin/appeals',
          ),
        ),
        'saved',
      );
      const decided = await db.appeal.findUniqueOrThrow({
        where: { id: appeal.id },
        include: { punishment: true },
      });
      assert.equal(decided.status, 'ACCEPTED');
      assert.equal(decided.decisionNote, 'proof was wrong');
      assert.ok(decided.punishment.revokedAt);
      assert.ok(
        await db.auditLog.findFirst({
          where: { at: { gte: since }, action: 'appeal.decide', targetSteamId: OTHER },
        }),
      );
    });

    const act = (who: string, body: Record<string, string>) =>
      browsers[who]!.send('/admin/live/action', body, '/admin');

    test('slay, say, mode — правата и аргументите на моста', async () => {
      assert.equal(result(await act('MOD', { steamId: TARGET, action: 'SLAY' })), 'denied');
      assert.equal(result(await act('ADMIN', { steamId: TARGET, action: 'SLAY' })), 'sent');
      assert.deepEqual(last(), { action: 'slay', args: { steamId: TARGET }, actor: ADMIN });
      assert.ok(
        await db.auditLog.findFirst({
          where: { at: { gte: since }, action: 'player.slay', actorSteamId: ADMIN },
        }),
      );

      assert.equal(
        (await browsers.HELPER!.send('/admin/live/say', { text: 'hi' }, '/admin')).status,
        403,
      );
      assert.equal(
        result(await browsers.MOD!.send('/admin/live/say', { text: 'Здравейте!' }, '/admin')),
        'sent',
      );
      assert.deepEqual(last(), { action: 'say', args: { text: 'Здравейте!' }, actor: MOD });

      assert.equal(
        (await browsers.MOD!.send('/admin/live/mode', { modeId: '1' }, '/admin')).status,
        403,
      );
      assert.equal(
        result(await browsers.ADMIN!.send('/admin/live/mode', { modeId: '99' }, '/admin')),
        'invalid',
      );
      assert.equal(
        result(await browsers.ADMIN!.send('/admin/live/mode', { modeId: '2' }, '/admin')),
        'sent',
      );
      assert.deepEqual(last(), { action: 'mode', args: { modeId: 2 }, actor: ADMIN });
    });
  },
);
