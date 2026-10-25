/**
 * Седмичната купа (§17) срещу истинската база: класирането на сайта и `!cup` на плъгина (CupStore.cs) дават една и
 * съща подредба (равен XP → по-малкият SteamID64), граници на седмицата [понеделник, понеделник), скрит играч и
 * 0 XP — вън; значките се връчват веднъж (повторно пускане — нищо), скрит победител не излиза в списъка.
 * Мачовете са в седмицата от понеделник 1.06.2099 (извън всяка истинска седмица). SteamID-та 76561190000986201…206.
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { closedWeeks, cupWeek } from '../src/cup.js';
import { awardCupWeek, loadCupStandings, loadCupWinners } from '../src/data/cup-data.js';
import { loadHonors } from '../src/data/honors.js';
import { cleanup, enabled } from './admin-harness.js';
import { bind, csharpConst } from './csharp-sql.js';

const A = '76561190000986201';
const B = '76561190000986202';
const C = '76561190000986203';
const ZERO = '76561190000986204';
const FOURTH = '76561190000986205';
const HIDDEN = '76561190000986206';
const IDS = [A, B, C, ZERO, FOURTH, HIDDEN];
const STANDINGS = csharpConst('Data/CupStore.cs', 'CupStandingsSql');
const TZ = 'Europe/Sofia';
const WEEK = cupWeek(new Date('2099-06-03T12:00:00Z'), TZ);

describe(
  'купата: класиране на сайта и на плъгина, значките',
  { skip: enabled ? false : 'няма DATABASE_URL' },
  () => {
    let db: PrismaClient;
    const matchIds: number[] = [];

    const match = async (endedAt: Date, rows: Array<[string, number]>) => {
      const created = await db.match.create({
        data: {
          map: 'de_dust2',
          mode: 'All Weapons',
          seasonId: 0,
          startedAt: new Date(endedAt.getTime() - 20 * 60_000),
          endedAt,
          kills: 0,
          players: rows.length,
          rows: {
            create: rows.map(([steamId, xp], index) => ({
              steamId,
              name: steamId,
              place: index + 1,
              xp,
            })),
          },
        },
      });
      matchIds.push(created.id);
    };

    const plugin = (s: string) =>
      db.$queryRawUnsafe<Array<{ place: number; steam_id: string; name: string; xp: number }>>(
        ...bind(STANDINGS, { from: WEEK.start, to: WEEK.end, podium: 3, s }),
      );

    before(async () => {
      db = new PrismaClient();
      await db.playerBadge.deleteMany({ where: { period: WEEK.key } });
      await cleanup(db, IDS);
      await db.player.createMany({
        data: [
          { steamId: A, name: 'IT Alpha' },
          { steamId: B, name: 'IT Bravo' },
          { steamId: C, name: 'IT Charlie' },
          { steamId: ZERO, name: 'IT Zero' },
          { steamId: FOURTH, name: 'IT Fourth' },
          { steamId: HIDDEN, name: 'IT Hidden', hiddenFromLeaderboards: true },
        ],
      });
      const hour = 3_600_000;
      await match(new Date(WEEK.start.getTime() + 2 * hour), [
        [A, 100],
        [B, 150],
        [HIDDEN, 500],
        [ZERO, 0],
      ]);
      await match(new Date(WEEK.start.getTime() + 30 * hour), [
        [A, 50],
        [C, 90],
        [FOURTH, 10],
      ]);
      // Границите: секунда преди началото и точно в края — извън седмицата.
      await match(new Date(WEEK.start.getTime() - 1000), [[C, 1000]]);
      await match(WEEK.end, [[FOURTH, 1000]]);
    });

    after(async () => {
      if (db) {
        await db.match.deleteMany({ where: { id: { in: matchIds } } });
        await cleanup(db, IDS);
        await db.$disconnect();
      }
    });

    test('класирането: сбор по седмицата, равен XP → по-малкият SteamID64, без скрит и без 0 XP', async () => {
      const rows = await loadCupStandings(db, WEEK, 20);
      assert.deepEqual(
        rows.map((r) => [r.place, r.steamId, r.xp, r.matches]),
        [
          [1, A, 150, 2],
          [2, B, 150, 1],
          [3, C, 90, 1],
          [4, FOURTH, 10, 1],
        ],
      );
      assert.equal(rows[0]?.name, 'IT Alpha');
      assert.equal((await loadCupStandings(db, WEEK, 3)).length, 3);
    });

    test('!cup (SQL на плъгина): същата подредба, първите трима + редът на играча', async () => {
      const site = (await loadCupStandings(db, WEEK, 3)).map((r) => [r.place, r.steamId, r.xp]);
      assert.deepEqual(
        (await plugin(ZERO)).map((r) => [r.place, r.steam_id, r.xp]),
        site,
        'играч без XP — само първите трима',
      );
      assert.deepEqual(
        (await plugin(FOURTH)).map((r) => [r.place, r.steam_id, r.xp, r.name]),
        [
          ...site.map((row, i) => [...row, ['IT Alpha', 'IT Bravo', 'IT Charlie'][i]]),
          [4, FOURTH, 10, 'IT Fourth'],
        ],
      );
      assert.equal((await plugin(HIDDEN)).length, 3, 'скритият не е в класирането');
    });

    test('значките: веднъж на седмица — шампион и подиум с {week, xp, place}', async () => {
      const first = await awardCupWeek(db, WEEK);
      assert.deepEqual(first, { week: WEEK.key, awarded: 3, skipped: false });
      assert.deepEqual(await awardCupWeek(db, WEEK), { week: WEEK.key, awarded: 0, skipped: true });
      const badges = await db.playerBadge.findMany({
        where: { period: WEEK.key },
        orderBy: { steamId: 'asc' },
        select: { steamId: true, kind: true, details: true },
      });
      assert.deepEqual(badges, [
        { steamId: A, kind: 'cup_winner', details: { week: WEEK.key, xp: 150, place: 1 } },
        { steamId: B, kind: 'cup_podium', details: { week: WEEK.key, xp: 150, place: 2 } },
        { steamId: C, kind: 'cup_podium', details: { week: WEEK.key, xp: 90, place: 3 } },
      ]);
      // Работникът проверява завършилите седмици — тази е сред тях седмица по-късно.
      const later = closedWeeks(new Date(WEEK.end.getTime() + 7 * 86_400_000), TZ, 4).map(
        (w) => w.key,
      );
      assert.ok(later.includes(WEEK.key));

      const winners = await loadCupWinners(db, 8);
      assert.deepEqual(winners[0], { week: WEEK.key, steamId: A, name: 'IT Alpha', xp: 150 });
      const honors = await loadHonors(db, A);
      assert.deepEqual(
        honors.badges.filter((b) => b.kind === 'cup_winner').map((b) => [b.count, b.best]),
        [[1, 150]],
      );
      await db.player.update({ where: { steamId: A }, data: { hiddenFromLeaderboards: true } });
      assert.ok(
        !(await loadCupWinners(db, 8)).some((w) => w.steamId === A),
        'скрит победител не излиза',
      );
    });
  },
);
