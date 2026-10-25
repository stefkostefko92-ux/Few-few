/**
 * Епохата на статистиките (CONTRACT §3) от двете страни: истинският SQL на плъгина (StatsWriter.cs)
 * срещу истинската база + `bumpEpoch` на панела. Стара партида не пипа редактираните стойности,
 * нова се добавя. SteamID 76561190000997101.
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { bumpEpoch } from '../src/admin/stats-edit.js';
import { cleanup, enabled } from './admin-harness.js';
import { bind, csharpConst } from './csharp-sql.js';

const ID = '76561190000997101';
const PLAYER_UPSERT = csharpConst('Data/StatsWriter.cs', 'PlayerUpsert');
const STATS_UPSERT = csharpConst('Data/StatsWriter.cs', 'StatsUpsert');
const WEAPON_UPSERT = csharpConst('Data/StatsWriter.cs', 'WeaponUpsert');
const ACTIVE_EVENT = csharpConst('Data/EventStore.cs', 'ActiveEventSql');

describe('SQL на плъгина: епохата', { skip: enabled ? false : 'няма DATABASE_URL' }, () => {
  let db: PrismaClient;

  /** Една партида, както я пише StatsWriter: играч + сезон 0 + оръжие. */
  async function flush(epoch: number, kills: number, playtime: number): Promise<void> {
    await db.$transaction([
      db.$executeRawUnsafe(...bind(PLAYER_UPSERT, { s: ID, n: 'IT Sql', pt: playtime, e: epoch })),
      db.$executeRawUnsafe(
        ...bind(STATS_UPSERT, {
          s: ID,
          season: 0,
          k: kills,
          d: 1,
          hs: 0,
          a: 0,
          dmg: 100,
          sf: 10,
          sh: 5,
          bs: kills,
          bc: 0,
          rv: 0,
          xp: BigInt(kills * 10),
          pt: playtime,
          e: epoch,
        }),
      ),
      db.$executeRawUnsafe(
        ...bind(WEAPON_UPSERT, { s: ID, season: 0, w: 'ak47', k: kills, hs: 0, e: epoch }),
      ),
    ]);
  }

  const read = async () => ({
    player: await db.player.findUniqueOrThrow({ where: { steamId: ID } }),
    stats: await db.playerSeasonStats.findUniqueOrThrow({
      where: { steamId_seasonId: { steamId: ID, seasonId: 0 } },
    }),
    weapon: await db.weaponSeasonStats.findUniqueOrThrow({
      where: { steamId_seasonId_weapon: { steamId: ID, seasonId: 0, weapon: 'ak47' } },
    }),
  });

  before(async () => {
    db = new PrismaClient();
    await db.scheduledEvent.deleteMany({ where: { createdBy: ID } });
    await cleanup(db, [ID]);
    await db.player.create({ data: { steamId: ID, name: 'IT Sql' } });
  });

  after(async () => {
    if (db) {
      await db.scheduledEvent.deleteMany({ where: { createdBy: ID } });
      await cleanup(db, [ID]);
      await db.$disconnect();
    }
  });

  test('без редакция: += както досега', async () => {
    await flush(0, 2, 60);
    await flush(0, 3, 60);
    const now = await read();
    assert.equal(now.stats.kills, 5);
    assert.equal(now.stats.xp, 50n);
    assert.equal(now.weapon.kills, 5);
    assert.equal(now.player.playtimeSec, 120);
  });

  test('след редакция: партидата със старата епоха не пипа нищо, новата се добавя', async () => {
    await db.$transaction(async (tx) => {
      assert.equal(await bumpEpoch(tx, ID), 1);
      await tx.playerSeasonStats.update({
        where: { steamId_seasonId: { steamId: ID, seasonId: 0 } },
        data: { kills: 100, xp: 1000n },
      });
    });
    await flush(0, 7, 60);
    let now = await read();
    assert.equal(now.stats.kills, 100, 'стара партида — отхвърлена');
    assert.equal(now.stats.xp, 1000n);
    assert.equal(now.weapon.kills, 5);
    assert.equal(now.player.playtimeSec, 120);
    await flush(1, 1, 30);
    now = await read();
    assert.equal(now.stats.kills, 101);
    assert.equal(now.stats.statsEpoch, 1);
    assert.equal(now.weapon.kills, 6);
    assert.equal(now.player.playtimeSec, 150);
    assert.equal(now.player.statsEpoch, 1, 'плъгинът не пипа епохата на играча');
  });

  test('нов ред, вмъкнат от стара партида, не блокира следващите', async () => {
    await db.$executeRawUnsafe(
      ...bind(WEAPON_UPSERT, { s: ID, season: 0, w: 'awp', k: 1, hs: 1, e: 0 }),
    );
    await db.$executeRawUnsafe(
      ...bind(WEAPON_UPSERT, { s: ID, season: 0, w: 'awp', k: 2, hs: 0, e: 1 }),
    );
    const awp = await db.weaponSeasonStats.findUniqueOrThrow({
      where: { steamId_seasonId_weapon: { steamId: ID, seasonId: 0, weapon: 'awp' } },
    });
    assert.equal(awp.kills, 3);
    assert.equal(awp.statsEpoch, 1);
  });

  test('текущото събитие (EventStore.cs): само неотменено и в момента; множителят като numeric', async () => {
    const now = Date.now();
    const event = await db.scheduledEvent.create({
      data: {
        kind: 'MODE',
        titleBg: 'IT събитие',
        titleEn: 'IT event',
        titleIt: 'IT evento',
        startsAt: new Date(now - 10 * 60_000),
        endsAt: new Date(now + 20 * 60_000),
        xpMultiplier: '1.5',
        dmModeId: 2,
        createdBy: ID,
      },
    });
    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(ACTIVE_EVENT);
    const row = rows.find((r) => r.id === event.id);
    assert.ok(row, 'текущото събитие се вижда');
    assert.equal(row.kind, 'MODE');
    assert.equal(String(row.xp_multiplier), '1.5');
    assert.equal(row.dm_mode_id, 2);
    await db.scheduledEvent.update({ where: { id: event.id }, data: { cancelledAt: new Date() } });
    const after = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(ACTIVE_EVENT);
    assert.ok(!after.some((r) => r.id === event.id), 'отмененото не се вижда');
  });
});
