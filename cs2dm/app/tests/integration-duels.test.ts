/**
 * Дуелите (§15) от двете страни срещу истинската база: SQL-ът на плъгина (DuelStore.cs) записва дуела,
 * изтрит играч — без ред; базата пази равенството и двамата различни (CHECK); профилът брои победи,
 * загуби и равни; чистенето по срок (§7) трие само старите. SteamID-та 76561190000988201…203.
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { loadHonors } from '../src/data/honors.js';
import { prismaDeleteBatch } from '../src/data/purge-sql.js';
import { cleanup, enabled } from './admin-harness.js';
import { bind, csharpConst } from './csharp-sql.js';

const ALPHA = '76561190000988201';
const BRAVO = '76561190000988202';
const GONE = '76561190000988203';
const IDS = [ALPHA, BRAVO, GONE];
const INSERT = csharpConst('Data/DuelStore.cs', 'InsertDuelSql');
const DAY = 86_400_000;

describe(
  'дуелите: SQL на плъгина, профил, срок',
  { skip: enabled ? false : 'няма DATABASE_URL' },
  () => {
    let db: PrismaClient;

    const duel = (
      w: string,
      l: string,
      ws: number,
      ls: number,
      draw: boolean,
      endedAt = new Date(),
    ) =>
      db.$executeRawUnsafe(
        ...bind(INSERT, {
          w,
          l,
          ws,
          ls,
          draw,
          started: new Date(endedAt.getTime() - 120_000),
          ended: endedAt,
        }),
      );

    before(async () => {
      db = new PrismaClient();
      await cleanup(db, IDS);
      await db.player.createMany({
        data: [
          { steamId: ALPHA, name: 'IT Alpha' },
          { steamId: BRAVO, name: 'IT Bravo' },
        ],
      });
    });

    after(async () => {
      if (db) {
        await cleanup(db, IDS);
        await db.$disconnect();
      }
    });

    test('записът и W–L–D в профила; изтрит играч — без ред', async () => {
      assert.equal(await duel(ALPHA, BRAVO, 5, 2, false), 1);
      assert.equal(await duel(ALPHA, BRAVO, 3, 1, false), 1);
      assert.equal(await duel(BRAVO, ALPHA, 5, 4, false), 1);
      assert.equal(await duel(ALPHA, BRAVO, 2, 2, true), 1);
      assert.equal(await duel(ALPHA, GONE, 5, 0, false), 0, 'изтрит играч — без ред, без грешка');
      assert.deepEqual((await loadHonors(db, ALPHA)).duels, { wins: 2, losses: 1, draws: 1 });
      assert.deepEqual((await loadHonors(db, BRAVO)).duels, { wins: 1, losses: 2, draws: 1 });
      assert.deepEqual((await loadHonors(db, GONE)).duels, { wins: 0, losses: 0, draws: 0 });
    });

    test('базата пази правилата (CHECK): равенство = равен резултат, двама различни', async () => {
      await assert.rejects(duel(ALPHA, BRAVO, 3, 2, true));
      await assert.rejects(duel(ALPHA, ALPHA, 5, 0, false));
    });

    test('срокът (§7): дуел по-стар от 90 дни се трие, новият остава; каскадно с играча', async () => {
      assert.equal(await duel(BRAVO, ALPHA, 5, 0, false, new Date(Date.now() - 91 * DAY)), 1);
      const before = await db.duel.count({ where: { winnerId: { in: IDS } } });
      const deleted = await prismaDeleteBatch(db)('duels', new Date(Date.now() - 90 * DAY), 5000);
      assert.ok(deleted >= 1);
      assert.equal(await db.duel.count({ where: { winnerId: { in: IDS } } }), before - 1);
      await db.player.delete({ where: { steamId: BRAVO } });
      assert.equal(
        await db.duel.count({ where: { OR: [{ winnerId: BRAVO }, { loserId: BRAVO }] } }),
        0,
        'каскадно с играча (право на изтриване)',
      );
    });
  },
);
