/**
 * Панелът срещу истинската база и истинския Redis pub/sub: наказания по §1 + immunity и командите
 * по моста (подписани — двойникът на плъгина проверява подписа като C#).
 * Тестови SteamID-та 76561190000992xxx; чисти ги преди и след себе си.
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
  type Answer,
  type Received,
} from './admin-harness.js';
import { decode } from './helpers.js';

const HELPER = '76561190000992001';
const MOD = '76561190000992002';
const ADMIN = '76561190000992003';
const TARGET = '76561190000992004';
const ADMIN_T = '76561190000992005';
const OFFLINE = '76561190000992006';
const OTHER = '76561190000992007';
const IDS = [HELPER, MOD, ADMIN, TARGET, ADMIN_T, OFFLINE, OTHER];
const SECRET = 'IT-ADMIN-REASON-7c1e';

describe('панел: наказания и мостът', { skip: enabled ? false : 'няма DATABASE_URL' }, () => {
  let db: PrismaClient;
  let close: () => Promise<void> = async () => {};
  const closers: Array<() => void> = [];
  const browsers: Record<string, Browser> = {};
  let received: Received[] = [];
  let answer: (command: Received) => Answer = () => ({ ok: true });
  /** Одитът не се чисти (веригата) — проверките гледат само редовете от това пускане. */
  const since = new Date();

  /** Последната команда към „плъгина“ от този файл. */
  const last = () => received.at(-1);
  const result = (response: Response) =>
    new URL(response.headers.get('location') ?? '', 'http://x').searchParams.get('r');

  before(async () => {
    db = new PrismaClient();
    await cleanup(db, IDS);
    await makePlayers(db, [
      { steamId: HELPER, name: 'IT Helper', role: 'HELPER' },
      { steamId: MOD, name: 'IT Mod', role: 'MODERATOR' },
      { steamId: ADMIN, name: 'IT Admin', role: 'ADMIN' },
      { steamId: TARGET, name: 'IT Target', role: 'PLAYER' },
      { steamId: ADMIN_T, name: 'IT Admin Target', role: 'ADMIN' },
      { steamId: OTHER, name: 'IT Offline', role: 'PLAYER' },
    ]);
    const key = testKey();
    const peer = await fakePeer(BRIDGE_CHANNELS, key, (command) => answer(command));
    received = peer.received;
    const bridge = channel(BRIDGE_CHANNELS, key);
    closers.push(peer.close, bridge.close);
    const live = memoryLive([
      livePlayer(TARGET, 'IT Target'),
      livePlayer(ADMIN_T, 'IT Admin Target', 'ADMIN'),
      livePlayer(null, 'BOT Ted'),
    ]);
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

  const act = (who: string, body: Record<string, string>) =>
    browsers[who]!.send('/admin/live/action', body, '/admin');

  test('таблото: бутоните по ролята; върху по-висок — нищо', async () => {
    const html = decode(await (await browsers.HELPER!.get('/admin')).text());
    assert.ok(html.includes('IT Target') && html.includes('BOT Ted'));
    const targetRow = html.slice(html.indexOf('IT Target'), html.indexOf('IT Admin Target'));
    assert.match(targetRow, /value="MUTE"/);
    assert.doesNotMatch(targetRow, /value="BAN"|value="SLAY"/, 'помощникът не бани и не убива');
    const adminRow = html.slice(html.indexOf('IT Admin Target'), html.indexOf('BOT Ted'));
    assert.doesNotMatch(adminRow, /name="action"/, 'immunity: няма бутони върху ADMIN');
    const modHtml = await (await browsers.MOD!.get('/admin')).text();
    assert.match(modHtml.slice(modHtml.indexOf('IT Target')), /value="BAN"/);
  });

  test('помощник: mute онлайн → запис WEB + подписан `punish`; бан и цел ADMIN → отказ', async () => {
    const mute = await act('HELPER', {
      steamId: TARGET,
      action: 'MUTE',
      amount: '30',
      unit: 'm',
      category: 'TOXICITY',
      reason: SECRET,
    });
    assert.equal(result(mute), 'sent');
    const row = await db.punishment.findFirstOrThrow({
      where: { steamId: TARGET, type: 'MUTE' },
    });
    assert.equal(row.source, 'WEB');
    assert.equal(row.actorSteamId, HELPER);
    assert.equal(row.category, 'TOXICITY');
    const minutes = ((row.expiresAt?.getTime() ?? 0) - row.createdAt.getTime()) / 60_000;
    assert.ok(Math.abs(minutes - 30) < 0.1);
    assert.deepEqual(last(), { action: 'punish', args: { punishmentId: row.id }, actor: HELPER });
    const audit = await db.auditLog.findFirstOrThrow({
      where: {
        at: { gte: since },
        action: 'punishment.mute',
        targetSteamId: TARGET,
        source: 'WEB',
      },
    });
    assert.equal(audit.actorSteamId, HELPER);
    assert.match(audit.hash ?? '', /^[0-9a-f]{64}$/);

    const count = received.length;
    const ban = await act('HELPER', {
      steamId: TARGET,
      action: 'BAN',
      amount: '1',
      unit: 'd',
      reason: 'x',
    });
    assert.equal(result(ban), 'denied');
    const immune = await act('HELPER', {
      steamId: ADMIN_T,
      action: 'MUTE',
      amount: '5',
      unit: 'm',
      reason: 'x',
    });
    assert.equal(result(immune), 'immune');
    const self = await act('HELPER', {
      steamId: HELPER,
      action: 'GAG',
      amount: '5',
      unit: 'm',
      reason: 'x',
    });
    assert.equal(result(self), 'immune', 'и не върху себе си');
    assert.equal(received.length, count, 'отказ ПРЕДИ подписа — нищо не стига до плъгина');
    assert.equal(await db.punishment.count({ where: { steamId: TARGET, type: 'BAN' } }), 0);
  });

  test('модератор: бан до 7 дни да; 8 дни и завинаги — не; kick онлайн; kick офлайн — не', async () => {
    assert.equal(
      result(
        await act('MOD', { steamId: TARGET, action: 'BAN', amount: '7', unit: 'd', reason: 'r' }),
      ),
      'sent',
    );
    assert.equal(
      result(
        await act('MOD', { steamId: TARGET, action: 'BAN', amount: '8', unit: 'd', reason: 'r' }),
      ),
      'denied',
    );
    assert.equal(
      result(await act('MOD', { steamId: TARGET, action: 'BAN', reason: 'r' })),
      'denied',
    );
    assert.equal(
      result(await act('MOD', { steamId: TARGET, action: 'BAN', amount: '1', unit: 'd' })),
      'invalid',
      'без причина',
    );
    const kick = await act('MOD', { steamId: TARGET, action: 'KICK', reason: 'r' });
    assert.equal(result(kick), 'sent');
    assert.deepEqual(last(), {
      action: 'kick',
      args: { steamId: TARGET, reason: 'r' },
      actor: MOD,
    });
    const offline = await browsers.MOD!.send(
      '/admin/punishments',
      {
        steamId: OTHER,
        type: 'KICK',
        reason: 'r',
      },
      '/admin/punishments',
    );
    assert.equal(result(offline), 'cmdNotOnline');
    assert.equal(await db.punishment.count({ where: { steamId: OTHER } }), 0);
  });

  test('админ: постоянен бан на непознат офлайн SteamID; причината е вътрешна; отмяна', async () => {
    const created = await browsers.ADMIN!.send(
      '/admin/punishments',
      {
        steamId: OFFLINE,
        name: 'IT Never Seen',
        type: 'BAN',
        category: 'CHEATING',
        reason: SECRET,
      },
      '/admin/punishments',
    );
    assert.equal(result(created), 'saved', 'офлайн — без команда по моста');
    const player = await db.player.findUniqueOrThrow({ where: { steamId: OFFLINE } });
    assert.equal(player.name, 'IT Never Seen');
    const ban = await db.punishment.findFirstOrThrow({ where: { steamId: OFFLINE } });
    assert.equal(ban.expiresAt, null);

    const internal = await (
      await browsers.HELPER!.get(`/admin/punishments?q=${OFFLINE}&status=all`)
    ).text();
    assert.ok(internal.includes(SECRET), 'вътрешният списък показва причината');
    const publicList = await (await fetch(`${browsers.ADMIN!.base}/bg/bans`)).text();
    assert.ok(!publicList.includes(SECRET), 'публичният банлист — никога');

    const helperRevoke = await browsers.HELPER!.send(
      `/admin/punishments/${ban.id}/revoke`,
      { reason: 'x' },
      '/admin/punishments',
    );
    assert.equal(result(helperRevoke), 'denied', 'unban — само ADMIN+');
    const revoke = await browsers.ADMIN!.send(
      `/admin/punishments/${ban.id}/revoke`,
      { reason: 'appeal ok' },
      '/admin/punishments',
    );
    assert.equal(result(revoke), 'saved');
    const again = await browsers.ADMIN!.send(
      `/admin/punishments/${ban.id}/revoke`,
      { reason: 'x' },
      '/admin/punishments',
    );
    assert.equal(result(again), 'notActive');
    const revoked = await db.punishment.findUniqueOrThrow({ where: { id: ban.id } });
    assert.equal(revoked.revokedBy, ADMIN);
    assert.ok(
      await db.auditLog.findFirst({
        where: { at: { gte: since }, action: 'punishment.revoke', targetSteamId: OFFLINE },
      }),
    );

    const filtered = await (
      await browsers.ADMIN!.get(`/admin/punishments?status=all&type=MUTE&actor=${HELPER}`)
    ).text();
    assert.ok(decode(filtered).includes('IT Target'));
    assert.ok(!decode(filtered).includes('IT Never Seen'));
  });

  test('плъгинът отказва → наказанието остава записано, с предупреждение', async () => {
    answer = () => ({ ok: false, error: 'not active' });
    const gag = await act('MOD', {
      steamId: TARGET,
      action: 'GAG',
      amount: '10',
      unit: 'm',
      reason: 'r',
    });
    assert.equal(result(gag), 'recordedNoAck');
    assert.equal(await db.punishment.count({ where: { steamId: TARGET, type: 'GAG' } }), 1);
    answer = () => ({ ok: true });
  });
});
