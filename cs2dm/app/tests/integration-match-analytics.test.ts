/**
 * Анализите на мача (§13) срещу истинската база: хайлайтите от `kills` в прозореца на мача. Скритият
 * играч (чл. 21 GDPR) не излиза с име или SteamID. SteamID-та 76561190000987101…103; `kills` няма FK към
 * играчите → тестът трие своите убийства сам, преди и след себе си.
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { loadMatchHighlights } from '../src/data/match-analytics.js';
import { cleanup, enabled } from './admin-harness.js';

const A = '76561190000987101';
const B = '76561190000987102';
const HIDDEN = '76561190000987103';
const IDS = [A, B, HIDDEN];
const MIN = 60_000;
// Прозорец, който не се застъпва с убийствата на другите интеграционни тестове (те пишат „сега“).
const T0 = new Date(Math.floor((Date.now() - 3 * 86_400_000 - 17 * MIN) / 1000) * 1000);

describe(
  'анализите на мача: хайлайти, личен отчет, последни мачове',
  { skip: enabled ? false : 'няма DATABASE_URL' },
  () => {
    let db: PrismaClient;
    let matchId = 0;
    let earlierId = 0;

    async function purge() {
      await db.kill.deleteMany({
        where: { OR: [{ attackerId: { in: IDS } }, { victimId: { in: IDS } }] },
      });
      await db.matchPlayer.deleteMany({ where: { steamId: { in: IDS } } });
      await cleanup(db, IDS);
    }

    const at = (sec: number) => new Date(T0.getTime() + sec * 1000);
    const kill = (
      sec: number,
      attackerId: string,
      victimId: string,
      extra: Partial<{
        weapon: string;
        headshot: boolean;
        wallbang: boolean;
        noscope: boolean;
        throughSmoke: boolean;
        attackerBlind: boolean;
        ax: number;
        vx: number;
      }> = {},
    ) => ({
      at: at(sec),
      seasonId: 1,
      mode: 'All Weapons',
      attackerId,
      victimId,
      weapon: 'ak47',
      distance: 0,
      ax: 0,
      ay: 0,
      az: 0,
      vx: 100,
      vy: 0,
      vz: 0,
      ...extra,
    });

    before(async () => {
      db = new PrismaClient();
      await purge();
      await db.player.createMany({
        data: [
          { steamId: A, name: 'IT Alpha' },
          { steamId: B, name: 'IT Bravo' },
          { steamId: HIDDEN, name: 'IT Hidden', hiddenFromLeaderboards: true },
        ],
      });
      const match = await db.match.create({
        data: {
          map: 'de_dust2',
          mode: 'All Weapons',
          seasonId: 1,
          startedAt: T0,
          endedAt: at(30 * 60),
          kills: 6,
          players: 3,
          rows: {
            create: [
              {
                steamId: A,
                name: 'IT Alpha',
                place: 1,
                kills: 4,
                deaths: 2,
                headshots: 1,
                bestStreak: 3,
                bountiesClaimed: 1,
                xp: 60,
              },
              { steamId: B, name: 'IT Bravo', place: 2, kills: 1, deaths: 3, headshots: 0, xp: 15 },
              { steamId: HIDDEN, name: 'IT Hidden', place: 3, kills: 1, deaths: 1, xp: 15 },
            ],
          },
        },
      });
      matchId = match.id;
      // Ден по-рано — убийствата му не са в прозореца на мача.
      const earlier = await db.match.create({
        data: {
          map: 'de_dust2',
          mode: 'All Weapons',
          seasonId: 1,
          startedAt: new Date(T0.getTime() - 86_400_000 - 30 * MIN),
          endedAt: new Date(T0.getTime() - 86_400_000),
          kills: 10,
          players: 2,
          rows: {
            create: [
              {
                steamId: A,
                name: 'IT Alpha',
                place: 1,
                kills: 10,
                deaths: 5,
                headshots: 4,
                xp: 150,
              },
            ],
          },
        },
      });
      earlierId = earlier.id;
      await db.kill.createMany({
        data: [
          kill(60, A, B, { headshot: true }),
          kill(65, A, B, { wallbang: true }),
          kill(70, A, HIDDEN, { noscope: true, weapon: 'awp' }), // 3K на 1:00
          kill(100, HIDDEN, A, { throughSmoke: true }), // A умира на (0, 0)
          kill(200, A, B, { weapon: 'awp', ax: -2000, vx: 2000 }), // 4000 единици = 101,6 m
          kill(300, B, A, { attackerBlind: true }),
          kill(31 * 60, A, B), // след края на мача — не се брои
        ],
      });
    });

    after(async () => {
      if (db) {
        await db.match.deleteMany({ where: { id: { in: [matchId, earlierId] } } });
        await purge();
        await db.$disconnect();
      }
    });

    test('хайлайтите: серия, колекцията, най-далечното; скритият е без име', async () => {
      const data = await loadMatchHighlights(db, matchId);
      assert.ok(data);
      assert.equal(data.recorded, true);
      assert.deepEqual(data.multiKills, [
        { steamId: A, name: 'IT Alpha', kills: 3, offsetMs: 60_000, weapons: ['ak47', 'awp'] },
      ]);
      const by = Object.fromEntries(data.collections.map((line) => [line.kind, line]));
      assert.deepEqual(by.wallbang?.leader, { steamId: A, name: 'IT Alpha' });
      assert.deepEqual(by.noscope?.leader, { steamId: A, name: 'IT Alpha' });
      assert.deepEqual(by.smoke?.leader, { steamId: null, name: null }, 'скритият водач');
      assert.deepEqual(by.blind?.leader, { steamId: B, name: 'IT Bravo' });
      assert.equal(data.longest?.steamId, A);
      assert.equal(data.longest?.weapon, 'awp');
      assert.ok(Math.abs((data.longest?.meters ?? 0) - 101.6) < 0.01);
      assert.equal(data.longest?.offsetMs, 200_000);
      assert.ok(!JSON.stringify(data).includes(HIDDEN), 'скритият SteamID не излиза');
      assert.ok(!JSON.stringify(data).includes('IT Hidden'));
      assert.equal(await loadMatchHighlights(db, 2_000_000_000), null);
    });
  },
);
