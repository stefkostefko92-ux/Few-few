/**
 * Мисиите за деня (§16) от двете страни срещу истинската база: SQL-ът на плъгина (MissionStore.cs) — напредъкът
 * само расте, изпълнението остава първото, изтрит играч — без ред; серията „7 дни подред“ се дава на 7, 14…
 * веднъж (уникален период); профилът чете трите мисии и броя; чистенето по срок (§7) трие само старите дни.
 * SteamID-та 76561190000986101…104.
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { loadMissions } from '../src/data/arena-data.js';
import { loadHonors } from '../src/data/honors.js';
import { prismaDeleteBatch } from '../src/data/purge-sql.js';
import { assignMissions } from '../src/missions.js';
import { cleanup, enabled } from './admin-harness.js';
import { bind, csharpConst } from './csharp-sql.js';

const STREAK = '76561190000986101';
const GAPPY = '76561190000986102';
const GONE = '76561190000986103';
const PROFILE = '76561190000986104';
const IDS = [STREAK, GAPPY, GONE, PROFILE];
const LOAD = csharpConst('Data/MissionStore.cs', 'LoadMissionsSql');
const UPSERT = csharpConst('Data/MissionStore.cs', 'UpsertMissionSql');
const BADGE = csharpConst('Data/MissionStore.cs', 'StreakBadgeSql');
const DAY_MS = 86_400_000;
const FULL_DAY = ['headshots_10', 'minutes_60', 'knife_1'];

const dayKey = (offset: number) =>
  new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);
const TODAY = dayKey(0);

describe(
  'мисиите: SQL на плъгина, серията, профилът, срокът',
  { skip: enabled ? false : 'няма DATABASE_URL' },
  () => {
    let db: PrismaClient;

    const upsert = (s: string, d: string, k: string, t: number, p: number, c: Date | null) =>
      db.$executeRawUnsafe(...bind(UPSERT, { s, d, k, t, p, c }));
    const streak = async (s: string, d: string) =>
      db.$queryRawUnsafe<Array<{ int4: number }>>(...bind(BADGE, { s, d, per: 3, need: 7 }));
    const fullDay = async (s: string, offset: number, done = 3) => {
      for (const [i, key] of FULL_DAY.entries()) {
        const target = Number(key.split('_')[1]);
        await upsert(s, dayKey(offset), key, target, target, i < done ? new Date() : null);
      }
    };

    before(async () => {
      db = new PrismaClient();
      await cleanup(db, IDS);
      await db.player.createMany({
        data: [
          { steamId: STREAK, name: 'IT Streak' },
          { steamId: GAPPY, name: 'IT Gappy' },
          { steamId: PROFILE, name: 'IT Profile' },
        ],
      });
    });

    after(async () => {
      if (db) {
        await cleanup(db, IDS);
        await db.$disconnect();
      }
    });

    test('напредъкът само расте, изпълнението остава първото; изтрит играч — без ред', async () => {
      const first = new Date('2026-10-25T10:00:00Z');
      const later = new Date('2026-10-25T11:00:00Z');
      assert.equal(await upsert(PROFILE, TODAY, 'pistol_10', 10, 3, null), 1);
      await upsert(PROFILE, TODAY, 'pistol_10', 10, 2, null);
      let rows = await db.$queryRawUnsafe<Array<{ mission_key: string; progress: number }>>(
        ...bind(LOAD, { s: PROFILE, d: TODAY }),
      );
      assert.deepEqual(
        rows.map((r) => [r.mission_key, r.progress]),
        [['pistol_10', 3]],
      );
      await upsert(PROFILE, TODAY, 'pistol_10', 10, 10, first);
      await upsert(PROFILE, TODAY, 'pistol_10', 10, 10, later);
      await upsert(PROFILE, TODAY, 'pistol_10', 10, 4, null);
      rows = await db.$queryRawUnsafe(...bind(LOAD, { s: PROFILE, d: TODAY }));
      const row = await db.missionProgress.findFirstOrThrow({
        where: { steamId: PROFILE, missionKey: 'pistol_10' },
      });
      assert.equal(row.progress, 10);
      assert.equal(row.completedAt?.toISOString(), first.toISOString());
      assert.equal(await upsert(GONE, TODAY, 'pistol_10', 10, 1, null), 0, 'изтрит играч');
    });

    test('базата пази правилата (CHECK): ключ, цел, напредък до целта, изпълнено = пълно', async () => {
      await assert.rejects(upsert(PROFILE, TODAY, 'Bad-Key', 10, 1, null));
      await assert.rejects(upsert(PROFILE, TODAY, 'smg_10', 10, 11, null));
      await assert.rejects(upsert(PROFILE, TODAY, 'smg_10', 0, 0, null));
      await assert.rejects(upsert(PROFILE, TODAY, 'smg_10', 10, 5, new Date()));
    });

    test('серията: значка на 7 и на 14 дни подред, веднъж; дупка и непълен ден я късат', async () => {
      for (let offset = -13; offset <= 0; offset++) await fullDay(STREAK, offset);
      assert.deepEqual(await streak(STREAK, dayKey(-7)), [{ int4: 7 }]);
      assert.deepEqual(await streak(STREAK, dayKey(-7)), [], 'идемпотентно — същият период');
      assert.deepEqual(await streak(STREAK, dayKey(-6)), [], '8 дни — не е кратно на 7');
      assert.deepEqual(await streak(STREAK, TODAY), [{ int4: 14 }]);
      const badges = await db.playerBadge.findMany({
        where: { steamId: STREAK, kind: 'mission_streak' },
        orderBy: { period: 'asc' },
      });
      assert.deepEqual(
        badges.map((b) => [b.period, b.details]),
        [
          [dayKey(-7), { days: 7 }],
          [TODAY, { days: 14 }],
        ],
      );

      for (let offset = -9; offset <= -7; offset++) await fullDay(GAPPY, offset);
      for (let offset = -5; offset <= 0; offset++)
        await fullDay(GAPPY, offset, offset === -2 ? 2 : 3);
      assert.deepEqual(await streak(GAPPY, TODAY), [], 'дупка на -6 и непълен ден на -2');
      assert.deepEqual(await streak(GONE, TODAY), []);

      const honors = await loadHonors(db, STREAK);
      const streakBadge = honors.badges.find((b) => b.kind === 'mission_streak');
      assert.equal(streakBadge?.count, 2);
      assert.equal(streakBadge?.best, 14);
      await assert.rejects(
        db.playerBadge.create({
          data: { steamId: STREAK, kind: 'mission_streak', period: TODAY, details: {} },
        }),
        'уникален период',
      );
      await db.playerBadge.createMany({
        data: [
          { steamId: STREAK, kind: 'zone_king', details: { kills: 3 } },
          { steamId: STREAK, kind: 'zone_king', details: { kills: 4 } },
        ],
      });
      assert.equal(
        await db.playerBadge.count({ where: { steamId: STREAK, kind: 'zone_king' } }),
        2,
        'без период — много пъти',
      );
    });

    test('профилът: трите мисии за деня с напредъка и броят изпълнени', async () => {
      const day = dayKey(-1);
      const [easy, medium] = assignMissions(PROFILE, day);
      assert.ok(easy && medium);
      await upsert(PROFILE, day, easy.key, easy.target, easy.target, new Date());
      await upsert(PROFILE, day, medium.key, medium.target, 1, null);
      await upsert(PROFILE, day, 'duel_1', 1, 1, new Date());
      const missions = await loadMissions(db, PROFILE, day);
      assert.equal(missions.day, day);
      assert.deepEqual(
        missions.today.map((m) => [m.key, m.progress, m.done]),
        [
          [easy.key, easy.target, true],
          [medium.key, 1, false],
          [assignMissions(PROFILE, day)[2]?.key, 0, false],
        ],
      );
      // pistol_10 от първия тест + двете изпълнени тук (и чуждият ключ duel_1 се брои в общото).
      assert.equal(missions.completed, 3);
    });

    test('срокът (§7): ден по-стар от 90 дни се трие, новите остават; каскадно с играча', async () => {
      await upsert(PROFILE, dayKey(-91), 'smg_10', 10, 2, null);
      const before = await db.missionProgress.count({ where: { steamId: PROFILE } });
      const deleted = await prismaDeleteBatch(db)(
        'missions',
        new Date(Date.now() - 90 * DAY_MS),
        5000,
      );
      assert.ok(deleted >= 1);
      assert.equal(await db.missionProgress.count({ where: { steamId: PROFILE } }), before - 1);
      await db.player.delete({ where: { steamId: GAPPY } });
      assert.equal(await db.missionProgress.count({ where: { steamId: GAPPY } }), 0);
    });
  },
);
