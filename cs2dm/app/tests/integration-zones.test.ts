/**
 * Горещата зона (§15) от двете страни срещу истинската база: SQL-ът на плъгина (ZoneStore.cs) — зоните на
 * картата, резервната зона от убийствата (най-гъстата клетка с височина), значката „Крал на зоната“ — и
 * публичното четене на отличията. Убийствата са в 2099 г. (извън всеки истински прозорец и срок).
 * SteamID-та 76561190000988101…103.
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { loadHonors } from '../src/data/honors.js';
import { sectorLabel } from '../src/heatmap.js';
import { cleanup, enabled } from './admin-harness.js';
import { bind, csharpConst } from './csharp-sql.js';

const KING = '76561190000988101';
const GONE = '76561190000988102';
const VICTIM = '76561190000988103';
const IDS = [KING, GONE, VICTIM];
const MAP = 'it_zone_map';
const LIST = csharpConst('Data/ZoneStore.cs', 'ListZonesSql');
const INSERT = csharpConst('Data/ZoneStore.cs', 'InsertZoneSql');
const DELETE = csharpConst('Data/ZoneStore.cs', 'DeleteZoneSql');
const DENSEST = csharpConst('Data/ZoneStore.cs', 'DensestCellSql');
const BADGE = csharpConst('Data/ZoneStore.cs', 'InsertBadgeSql');

/** Параметрите, както ги подава `DensestZoneAsync` (константите на Dust2Grid и HotZoneRules). */
const cluster = (since: Date, until: Date, min = 5) => ({
  px: -2476,
  py: 3239,
  cell: 32 * 4.4,
  band: 128,
  since,
  until,
  last: 31,
  min,
});

describe(
  'горещата зона: SQL на плъгина и отличията',
  { skip: enabled ? false : 'няма DATABASE_URL' },
  () => {
    let db: PrismaClient;
    const since = new Date('2099-01-01T00:00:00Z');
    const until = new Date('2099-01-08T00:00:00Z');

    before(async () => {
      db = new PrismaClient();
      await db.kill.deleteMany({ where: { victimId: { in: IDS } } });
      await db.mapZone.deleteMany({ where: { map: MAP } });
      await cleanup(db, IDS);
      await db.player.createMany({
        data: [
          { steamId: KING, name: 'IT King' },
          { steamId: VICTIM, name: 'IT Victim' },
        ],
      });
    });

    after(async () => {
      if (db) {
        await db.kill.deleteMany({ where: { victimId: { in: IDS } } });
        await db.mapZone.deleteMany({ where: { map: MAP } });
        await cleanup(db, IDS);
        await db.$disconnect();
      }
    });

    test('зоните на картата: запис, списък, триене само от същата карта', async () => {
      const [row] = await db.$queryRawUnsafe<Array<{ id: number }>>(
        ...bind(INSERT, { m: MAP, n: 'Long A', x: 1200.5, y: 900, z: 64, r: 300, a: KING }),
      );
      const id = row!.id;
      const list = await db.$queryRawUnsafe<Array<{ id: number; name: string; radius: number }>>(
        ...bind(LIST, { m: MAP }),
      );
      assert.deepEqual(
        list.map((zone) => [zone.id, zone.name, zone.radius]),
        [[id, 'Long A', 300]],
      );
      const wrongMap = await db.$queryRawUnsafe<unknown[]>(...bind(DELETE, { id, m: 'de_other' }));
      assert.equal(wrongMap.length, 0, 'чужда карта — нищо');
      const removed = await db.$queryRawUnsafe<Array<{ name: string }>>(
        ...bind(DELETE, { id, m: MAP }),
      );
      assert.deepEqual(removed, [{ name: 'Long A' }]);
    });

    test('базата пази името и радиуса (CHECK) като C# правилата', async () => {
      await assert.rejects(
        db.$queryRawUnsafe(...bind(INSERT, { m: MAP, n: 'x', x: 0, y: 0, z: 0, r: 99, a: null })),
      );
      await assert.rejects(
        db.$queryRawUnsafe(
          ...bind(INSERT, { m: MAP, n: 'a<b>', x: 0, y: 0, z: 0, r: 250, a: null }),
        ),
      );
    });

    test('резервната зона: най-гъстата клетка, етажите не се смесват, под минимума — нищо', async () => {
      const at = (minute: number) => new Date(since.getTime() + minute * 60_000);
      const kill = (minute: number, x: number, y: number, z: number) => ({
        at: at(minute),
        seasonId: 0,
        mode: 'it',
        attackerId: KING,
        victimId: VICTIM,
        weapon: 'ak47',
        distance: 500,
        ax: 0,
        ay: 0,
        az: 0,
        vx: x,
        vy: y,
        vz: z,
      });
      await db.kill.createMany({
        data: [
          // Шест долу в една клетка около (0, 0) — сектор E6.
          ...[0, 1, 2, 3, 4, 5].map((i) => kill(i, 10 + i * 4, 20 - i * 2, 0)),
          // Седем на същото място, но 300 единици по-горе — друг „етаж“ (клетка с височина).
          ...[0, 1, 2, 3, 4, 5, 6].map((i) => kill(10 + i, 12 + i, 18, 300)),
          // Разпилени и едно извън радара.
          kill(30, 1500, -500, 0),
          kill(31, -3000, 0, 0),
        ],
      });
      const [top] = await db.$queryRawUnsafe<Array<{ n: number; x: number; y: number; z: number }>>(
        ...bind(DENSEST, cluster(since, until)),
      );
      assert.ok(top);
      assert.equal(top.n, 7, 'горният етаж е по-гъст');
      assert.ok(Math.abs(top.z - 300) < 0.01);
      assert.equal(sectorLabel(top.x, top.y), 'E6');
      const lower = await db.$queryRawUnsafe<unknown[]>(...bind(DENSEST, cluster(since, at(10))));
      assert.equal((lower[0] as { n: number } | undefined)?.n, 6, 'прозорецът реже по време');
      const none = await db.$queryRawUnsafe<unknown[]>(...bind(DENSEST, cluster(since, until, 8)));
      assert.equal(none.length, 0, 'под минимума няма резервна зона');
    });

    test('значката: изтрит играч не получава ред; профилът брои и пази рекорда', async () => {
      const badge = (s: string, kills: unknown) =>
        db.$executeRawUnsafe(
          ...bind(BADGE, {
            s,
            k: 'zone_king',
            d: JSON.stringify({ map: 'de_dust2', zone: 'C4', kills }),
          }),
        );
      assert.equal(await badge(KING, 4), 1);
      assert.equal(await badge(KING, 9), 1);
      assert.equal(await badge(KING, 'много'), 1, 'нечислово — без грешка, само без рекорд');
      assert.equal(await badge(GONE, 5), 0, 'изтрит играч — без ред, без грешка');
      const honors = await loadHonors(db, KING);
      assert.equal(honors.badges.length, 1);
      const [king] = honors.badges;
      assert.equal(king?.kind, 'zone_king');
      assert.equal(king?.count, 3);
      assert.equal(king?.bestKills, 9);
      assert.ok(king?.lastAt instanceof Date);
      assert.deepEqual(await loadHonors(db, VICTIM), { badges: [] });

      await db.player.delete({ where: { steamId: KING } });
      assert.equal(
        await db.playerBadge.count({ where: { steamId: KING } }),
        0,
        'каскадно с играча',
      );
    });
  },
);
