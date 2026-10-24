/**
 * Картата на мача (§13) от двете страни срещу истинската база: SQL-ът на плъгина (MatchStore.cs)
 * записва мача, изтрит играч просто липсва; публичното четене крие скрития играч (чл. 21 GDPR);
 * чистенето по срок (§7) трие мача и редовете му каскадно. SteamID-та 76561190000997201…203.
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { loadMatch, loadRecentMatches } from '../src/data/public-extra.js';
import { prismaDeleteBatch } from '../src/data/purge-sql.js';
import { cleanup, enabled } from './admin-harness.js';
import { bind, csharpConst } from './csharp-sql.js';

const WINNER = '76561190000997201';
const HIDDEN = '76561190000997202';
const GONE = '76561190000997203';
const IDS = [WINNER, HIDDEN, GONE];
const INSERT_MATCH = csharpConst('Data/MatchStore.cs', 'InsertMatchSql');
const INSERT_PLAYER = csharpConst('Data/MatchStore.cs', 'InsertPlayerSql');

describe(
  'мачове: SQL на плъгина, публично четене, срок',
  { skip: enabled ? false : 'няма DATABASE_URL' },
  () => {
    let db: PrismaClient;
    const created: number[] = [];

    async function insertMatch(endedAt: Date): Promise<number> {
      const rows = await db.$queryRawUnsafe<Array<{ id: number }>>(
        ...bind(INSERT_MATCH, {
          map: 'de_dust2',
          mode: 'All Weapons',
          season: 1,
          event: null,
          xp: new Prisma.Decimal('1.5'),
          started: new Date(endedAt.getTime() - 30 * 60_000),
          ended: endedAt,
          kills: 12,
          players: 3,
        }),
      );
      const id = rows[0]!.id;
      created.push(id);
      const line = (s: string, n: string, place: number, k: number, w: string | null) =>
        db.$executeRawUnsafe(
          ...bind(INSERT_PLAYER, {
            match: id,
            s,
            n,
            place,
            k,
            d: 3,
            hs: 2,
            bs: 4,
            bc: 1,
            xp: k * 15,
            w,
            wk: w ? k : 0,
          }),
        );
      assert.equal(await line(WINNER, 'IT Winner', 1, 8, 'ak47'), 1);
      assert.equal(await line(HIDDEN, 'IT Hidden', 2, 3, null), 1);
      assert.equal(
        await line(GONE, 'IT Gone', 3, 1, null),
        0,
        'изтрит играч — без ред, без грешка',
      );
      return id;
    }

    before(async () => {
      db = new PrismaClient();
      await cleanup(db, IDS);
      await db.player.createMany({
        data: [
          { steamId: WINNER, name: 'IT Winner' },
          { steamId: HIDDEN, name: 'IT Hidden', hiddenFromLeaderboards: true },
        ],
      });
    });

    after(async () => {
      if (db) {
        await db.match.deleteMany({ where: { id: { in: created } } });
        await cleanup(db, IDS);
        await db.$disconnect();
      }
    });

    test('записът от плъгина и картата: скритият е без име и SteamID', async () => {
      const id = await insertMatch(new Date());
      const match = await loadMatch(db, id);
      assert.ok(match);
      assert.equal(match.xpTenths, 15);
      assert.deepEqual(
        match.rows.map((r) => [r.place, r.steamId, r.name, r.kills, r.topWeapon]),
        [
          [1, WINNER, 'IT Winner', 8, 'ak47'],
          [2, null, null, 3, null],
        ],
      );
      const list = await loadRecentMatches(db, 50);
      assert.deepEqual(list.find((m) => m.id === id)?.top, {
        steamId: WINNER,
        name: 'IT Winner',
        kills: 8,
      });
      assert.equal(await loadMatch(db, 2_000_000_000), null);
    });

    test('срокът (§7): стар мач се трие с редовете си, новият остава', async () => {
      const old = await insertMatch(new Date(Date.now() - 91 * 86_400_000));
      const fresh = created[0]!;
      const deleted = await prismaDeleteBatch(db)(
        'matches',
        new Date(Date.now() - 90 * 86_400_000),
        5000,
      );
      assert.ok(deleted >= 1);
      assert.equal(await db.match.count({ where: { id: old } }), 0);
      assert.equal(await db.matchPlayer.count({ where: { matchId: old } }), 0, 'каскадно');
      assert.equal(await db.match.count({ where: { id: fresh } }), 1);
    });
  },
);
