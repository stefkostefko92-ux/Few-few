/**
 * „Подозрителни играчи“ (§10) срещу истинската база: SQL-ът (`kills` с FILTER + минутите от `sessions`),
 * оценяването и страницата — ADMIN+ я вижда, MODERATOR не; скритият е без публични отчети; на страницата
 * няма действие. SteamID-та 76561190000987201…232; `kills` няма FK → тестът трие своите убийства сам.
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { UNAVAILABLE } from '../src/admin/commands.js';
import { loadFlagInputs, loadFlagMatches } from '../src/admin/flags-data.js';
import { scoreFlags } from '../src/admin/flags.js';
import { decode } from './helpers.js';
import {
  Browser,
  cleanup,
  enabled,
  enrol,
  makePlayers,
  memoryLive,
  panelApp,
} from './admin-harness.js';

const ADMIN = '76561190000987201';
const MOD = '76561190000987202';
const NORMALS = Array.from({ length: 11 }, (_, i) => `765611900009872${String(10 + i)}`);
const CHEAT = '76561190000987230';
const SPIKE = '76561190000987231';
const HIDDEN = '76561190000987232';
const PLAYERS = [...NORMALS, CHEAT, SPIKE, HIDDEN];
const IDS = [ADMIN, MOD, ...PLAYERS];
const DAY = 86_400_000;

describe('панел: подозрителни играчи', { skip: enabled ? false : 'няма DATABASE_URL' }, () => {
  let db: PrismaClient;
  let close: () => Promise<void> = async () => {};
  const as: Record<string, Browser> = {};
  let matchId = 0;

  async function wipe(): Promise<void> {
    await db.kill.deleteMany({
      where: { OR: [{ attackerId: { in: IDS } }, { victimId: { in: IDS } }] },
    });
    if (matchId) await db.match.deleteMany({ where: { id: matchId } });
    await cleanup(db, IDS);
  }

  /** `count` убийства на `attacker` преди `ago` ms; първите `hs` в главата и т.н. */
  function kills(
    attacker: string,
    count: number,
    ago: number,
    flags: { hs?: number; wall?: number; smoke?: number } = {},
  ) {
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => ({
      at: new Date(now - ago - i * 1000),
      seasonId: 1,
      mode: 'All Weapons',
      attackerId: attacker,
      victimId:
        NORMALS[i % NORMALS.length] === attacker ? NORMALS[0]! : NORMALS[i % NORMALS.length]!,
      weapon: 'ak47',
      headshot: i < (flags.hs ?? 0),
      wallbang: i < (flags.wall ?? 0),
      throughSmoke: i < (flags.smoke ?? 0),
      distance: 0,
      ax: 0,
      ay: 0,
      az: 0,
      vx: 100,
      vy: 0,
      vz: 0,
    }));
  }

  before(async () => {
    db = new PrismaClient();
    await wipe();
    await makePlayers(db, [
      { steamId: ADMIN, name: 'IT Flags Admin', role: 'ADMIN' },
      { steamId: MOD, name: 'IT Flags Mod', role: 'MODERATOR' },
      ...NORMALS.map((steamId, i) => ({
        steamId,
        name: `IT Normal ${i + 1}`,
        role: 'PLAYER' as const,
      })),
      { steamId: CHEAT, name: 'IT Cheat', role: 'PLAYER' },
      { steamId: SPIKE, name: 'IT Spike', role: 'PLAYER' },
      { steamId: HIDDEN, name: 'IT Hidden Cheat', role: 'PLAYER' },
    ]);
    await db.player.update({ where: { steamId: HIDDEN }, data: { hiddenFromLeaderboards: true } });
    await db.player.update({ where: { steamId: ADMIN }, data: { lang: 'bg' } });
    await db.kill.createMany({
      data: [
        ...NORMALS.flatMap((id) => kills(id, 60, DAY, { hs: 18 })),
        ...kills(CHEAT, 80, DAY, { hs: 76, wall: 24 }),
        ...kills(SPIKE, 60, DAY, { hs: 42 }),
        ...kills(SPIKE, 60, 10 * DAY, { hs: 18 }), // базата: дни 8–28
        ...kills(HIDDEN, 60, DAY, { hs: 30, smoke: 18 }),
      ],
    });
    const now = Date.now();
    await db.session.create({
      data: {
        steamId: CHEAT,
        connectedAt: new Date(now - 2 * DAY),
        disconnectedAt: new Date(now - 2 * DAY + 40 * 60_000),
      },
    });
    const match = await db.match.create({
      data: {
        map: 'de_dust2',
        mode: 'All Weapons',
        seasonId: 1,
        startedAt: new Date(now - DAY - 30 * 60_000),
        endedAt: new Date(now - DAY),
        kills: 80,
        players: 2,
        rows: {
          create: [
            { steamId: CHEAT, name: 'IT Cheat', place: 1, kills: 80 },
            { steamId: HIDDEN, name: 'IT Hidden Cheat', place: 2, kills: 60 },
          ],
        },
      },
    });
    matchId = match.id;
    const app = await panelApp({
      db,
      live: memoryLive([]),
      bridge: UNAVAILABLE,
      agent: UNAVAILABLE,
    });
    close = app.close;
    for (const [name, steamId] of Object.entries({ ADMIN, MOD })) {
      as[name] = new Browser(app.base);
      await enrol(as[name]!, steamId);
    }
  });

  after(async () => {
    await close();
    if (db) {
      await wipe();
      await db.$disconnect();
    }
  });

  test('SQL-ът: прозорец срещу база, минути от сесиите, само наши редове', async () => {
    const inputs = await loadFlagInputs(db, new Date());
    const by = new Map(inputs.map((row) => [row.steamId, row]));
    const cheat = by.get(CHEAT);
    assert.ok(cheat);
    assert.equal(cheat.kills, 80);
    assert.equal(cheat.headshots, 76);
    assert.equal(cheat.wallbangs, 24);
    assert.ok(Math.abs(cheat.minutes - 40) < 0.01, `минути ${cheat.minutes}`);
    assert.equal(cheat.base.kills, 0);
    const spike = by.get(SPIKE);
    assert.equal(spike?.kills, 60);
    assert.equal(spike?.base.kills, 60);
    assert.equal(spike?.base.headshots, 18);
    assert.equal(by.get(HIDDEN)?.hidden, true);

    const report = scoreFlags(inputs);
    const flagged = new Map(report.flagged.map((p) => [p.steamId, p]));
    assert.ok(report.population >= PLAYERS.length);
    assert.equal(flagged.get(CHEAT)?.reasons, 2, 'в главата и през стена');
    const spikeHs = flagged.get(SPIKE)?.metrics.find((m) => m.id === 'hs');
    assert.equal(spikeHs?.spike, true);
    assert.ok(flagged.get(HIDDEN)?.metrics.find((m) => m.id === 'smoke')?.outlier);
    for (const id of NORMALS) assert.equal(flagged.has(id), false, `${id} не е флагнат`);

    const links = await loadFlagMatches(db, [CHEAT, SPIKE], new Date());
    assert.deepEqual(links.get(CHEAT), [matchId]);
    assert.equal(links.has(SPIKE), false);
  });

  test('страницата: ADMIN+ вижда, MODERATOR не; флагът не е присъда; скритият без отчети', async () => {
    assert.equal((await as.MOD!.get('/admin/flags')).status, 403);
    const response = await as.ADMIN!.get('/admin/flags');
    assert.equal(response.status, 200);
    const html = decode(await response.text());
    assert.ok(html.includes('Флагът не е присъда.'));
    assert.ok(html.includes('чл. 22 GDPR'));
    assert.ok(html.includes('IT Cheat') && html.includes('IT Spike'));
    assert.ok(!html.includes('IT Normal'), 'обикновените играчи не са в списъка');
    assert.ok(html.includes(`href="/admin/players/${CHEAT}"`));
    assert.ok(html.includes(`href="/bg/match/${matchId}/player/${CHEAT}"`), 'отчетът на мача');
    assert.ok(!html.includes(`/player/${HIDDEN}"`), 'скритият няма публичен отчет');
    assert.ok(html.includes('Публичните отчети на скрит играч не се показват'));
    assert.ok(html.includes('href="/admin/flags"'), 'в менюто');
    // Само преглед: никакво действие от страницата.
    assert.ok(!/<form method="post" action="\/admin\/(punishments|players)/.test(html));
    const nav = decode(await (await as.MOD!.get('/admin')).text());
    assert.ok(!nav.includes('href="/admin/flags"'), 'модераторът не вижда раздела');
  });
});
