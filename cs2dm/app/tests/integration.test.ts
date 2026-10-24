/**
 * Интеграционен тест срещу истинска PostgreSQL (мигрирана схема) и Redis.
 *
 * Пропуска се чисто без DATABASE_URL (unit средата в CI). Работи само с тестови SteamID-та в
 * диапазона 76561190000990xxx и VIP ниво `it-cs2dm-web`; чисти ги преди и след себе си — в базата
 * не остават тестови данни. Redis: отделна база (REDIS_TEST_URL, по подразбиране /15).
 */
import './env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaRepo } from '../src/data/prisma-repo.js';
import { prismaDeleteBatch } from '../src/data/purge-sql.js';
import { LIVE_KEY, RedisLiveSource } from '../src/live.js';
import { MAINTENANCE_QUEUE, PURGE_JOB, PURGE_SCHEDULE } from '../src/queue.js';
import { PURGE_TARGETS, purge } from '../src/retention.js';
import { fakeRepo, sampleData, start } from './helpers.js';

const enabled =
  Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes('127.0.0.1:1/');
const REDIS_TEST_URL = process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:6379/15';

const ACTIVE = '76561190000990001';
const HIDDEN = '76561190000990002';
const BANNED = '76561190000990003';
const IDS = [ACTIVE, HIDDEN, BANNED];
const TIER = 'it-cs2dm-web';
const SECRET = 'IT-SECRET-REASON-91c2';

describe('срещу истинската база', { skip: enabled ? false : 'няма DATABASE_URL' }, () => {
  const DAY = 24 * 60 * 60 * 1000;

  let prisma: PrismaClient;
  let close: () => Promise<void> = async () => {};
  let get: (path: string) => Promise<Response> = async () => new Response();

  async function cleanup(): Promise<void> {
    await prisma.kill.deleteMany({
      where: { OR: [{ attackerId: { in: IDS } }, { victimId: { in: IDS } }] },
    });
    // Каскадата трие сесии, статистики, наказания, VIP заявки и дарения на тези играчи.
    await prisma.player.deleteMany({ where: { steamId: { in: IDS } } });
    await prisma.vipTier.deleteMany({ where: { code: TIER } });
  }

  before(async () => {
    prisma = new PrismaClient();
    await cleanup();

    const now = Date.now();
    const season = await new PrismaRepo(prisma).currentSeason();
    await prisma.player.createMany({
      data: [
        { steamId: ACTIVE, name: 'IT Sandstorm' },
        { steamId: HIDDEN, name: 'IT Hidden', hiddenFromLeaderboards: true },
        { steamId: BANNED, name: 'IT Banned' },
      ],
    });
    const seasonIds = season.id === 0 ? [0] : [0, season.id];
    for (const seasonId of seasonIds) {
      await prisma.playerSeasonStats.createMany({
        data: [
          {
            steamId: ACTIVE,
            seasonId,
            kills: 9_000_001,
            deaths: 10,
            headshots: 5,
            xp: 90_000_000n,
          },
          {
            steamId: HIDDEN,
            seasonId,
            kills: 9_000_002,
            deaths: 10,
            headshots: 5,
            xp: 90_000_001n,
          },
        ],
      });
    }
    await prisma.weaponSeasonStats.create({
      data: { steamId: ACTIVE, seasonId: 0, weapon: 'weapon_awp', kills: 1600, headshots: 900 },
    });
    // Две скорошни убийства (за heatmap-а), едно от последния час (не бива да се вижда) и
    // едно на 100 дни (за чистенето).
    const kill = (at: number, x: number, y: number) => ({
      at: new Date(at),
      seasonId: 0,
      mode: 'All Weapons',
      attackerId: ACTIVE,
      victimId: BANNED,
      weapon: 'weapon_awp',
      distance: 100,
      ax: x,
      ay: y,
      az: 0,
      vx: x + 200,
      vy: y,
      vz: 0,
    });
    await prisma.kill.createMany({
      data: [
        kill(now - 2 * DAY, -2476 + 4.4 * 100, 3239 - 4.4 * 100),
        kill(now - 3 * DAY, -2476 + 4.4 * 101, 3239 - 4.4 * 101),
        kill(now - 10 * 60 * 1000, -2476 + 4.4 * 900, 3239 - 4.4 * 900),
        kill(now - 100 * DAY, -2476 + 4.4 * 500, 3239 - 4.4 * 500),
      ],
    });
    await prisma.session.createMany({
      data: [
        { steamId: ACTIVE, ip: '198.51.100.7', connectedAt: new Date(now - 40 * DAY) },
        { steamId: ACTIVE, ip: '198.51.100.7', connectedAt: new Date(now - 2 * DAY) },
      ],
    });
    await prisma.punishment.createMany({
      data: [
        {
          type: 'BAN',
          steamId: BANNED,
          targetName: 'IT Banned',
          category: 'CHEATING',
          reason: SECRET,
          source: 'GAME',
          actorSteamId: '76561198999999998',
        },
        {
          type: 'BAN',
          steamId: BANNED,
          targetName: 'IT Revoked',
          category: 'SPAM',
          reason: SECRET,
          source: 'GAME',
          revokedAt: new Date(now - DAY),
        },
        {
          type: 'BAN',
          steamId: BANNED,
          targetName: 'IT Expired',
          category: 'SPAM',
          reason: SECRET,
          source: 'GAME',
          expiresAt: new Date(now - DAY),
        },
        {
          type: 'MUTE',
          steamId: BANNED,
          targetName: 'IT Muted',
          category: 'TOXICITY',
          reason: SECRET,
          source: 'GAME',
        },
      ],
    });
    await prisma.vipTier.create({
      data: { code: TIER, name: 'IT Gold', priceCents: 1250, periodDays: 30, sortOrder: -1000 },
    });

    const app = await start({ repo: new PrismaRepo(prisma) });
    close = app.close;
    get = app.get;
  });

  after(async () => {
    await close();
    if (prisma) {
      await cleanup();
      await prisma.$disconnect();
    }
  });

  test('класацията показва играча, но не и скрития (чл. 21 GDPR)', async () => {
    const html = await (await get('/bg/leaderboard')).text();
    assert.ok(html.includes('IT Sandstorm'));
    assert.ok(!html.includes('IT Hidden'));
    // 90 000 000 XP → ниво 1342 (100 · n · (n − 1) / 2 ≤ XP).
    assert.match(html, /<td class="c-num c-level">1342<\/td>/);
    // Ботовете носят половин XP (CONTRACT §3) — редът е в таблицата „Как се смятат XP“.
    assert.match(html, /Убийство на бот<\/th><td class="c-num">½ от сбора<\/td>/);
    const kd = await (await get('/en/leaderboard?sort=kd')).text();
    assert.ok(kd.includes('IT Sandstorm'), 'K/D сортирането минава през суровия SQL');
  });

  test('профилът: статистики, майсторство и heatmap само от прозореца', async () => {
    const response = await get(`/en/player/${ACTIVE}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<h1 class="profile-name">IT Sandstorm<\/h1>/);
    assert.match(html, /badge-gold/);
    const killCells = html.slice(html.indexOf('heatmap-kills'), html.indexOf('heatmap-deaths'));
    // Двете скорошни убийства са в клетка (3,3); убийството отпреди 10 минути (28,28) го няма.
    assert.equal((killCells.match(/class="hm-cell"/g) ?? []).length, 1);
    assert.match(killCells, /class="hm-cell" x="96" y="96"/);
    assert.equal((await get(`/en/player/${HIDDEN}`)).status, 404, 'скритият профил не е публичен');
  });

  test('банлистът: само активният бан, без причина и без админ', async () => {
    const html = await (await get('/bg/bans')).text();
    assert.ok(html.includes('IT Banned'));
    assert.ok(!html.includes('IT Revoked'), 'отменен');
    assert.ok(!html.includes('IT Expired'), 'изтекъл');
    assert.ok(!html.includes('IT Muted'), 'mute не е бан');
    assert.ok(!html.includes(SECRET), 'причината не е публична');
    assert.ok(!html.includes('76561198999999998'), 'админът не е публичен');
    const home = await (await get('/en/')).text();
    assert.ok(home.includes('IT Banned') && !home.includes(SECRET));
  });

  test('VIP: цена с ДДС от евроцентове', async () => {
    const html = await (await get('/bg/vip')).text();
    assert.ok(html.replace(/\s/g, ' ').includes('12,50 €'));
    assert.ok(html.includes('IT Gold'));
  });

  test('sitemap включва видимия играч, но не и скрития', async () => {
    const xml = await (await get('/sitemap.xml')).text();
    assert.ok(xml.includes(`/bg/player/${ACTIVE}`));
    assert.ok(!xml.includes(HIDDEN));
  });

  test('/health с истинската база', async () => {
    const app = await start({
      repo: fakeRepo(sampleData()),
      health: {
        db: async () => {
          await prisma.$queryRaw`SELECT 1`;
        },
        redis: async () => {},
      },
    });
    try {
      assert.equal((await app.get('/health')).status, 200);
    } finally {
      await app.close();
    }
  });

  test('чистенето трие сесиите над 30 дни и убийствата над 90, останалото стои', async () => {
    const now = new Date();
    for (const target of PURGE_TARGETS) await purge(target, prismaDeleteBatch(prisma), now);
    const sessions = await prisma.session.findMany({ where: { steamId: ACTIVE } });
    assert.equal(sessions.length, 1);
    assert.ok(sessions[0]!.connectedAt.getTime() > now.getTime() - 30 * DAY);
    const kills = await prisma.kill.count({ where: { attackerId: ACTIVE } });
    assert.equal(kills, 3, 'остават трите скорошни убийства');
    // Повторното пускане е безвредно.
    const again = await purge({ id: 'kills', days: 90 }, prismaDeleteBatch(prisma), now);
    assert.equal(again.deleted, 0);
  });
});

describe('срещу истинския Redis', { skip: enabled ? false : 'няма DATABASE_URL' }, () => {
  test('живото състояние от cs2dm:live и планировчикът на BullMQ', async (t) => {
    const redis = new Redis(REDIS_TEST_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    try {
      await redis.connect();
    } catch {
      redis.disconnect();
      t.skip('няма Redis на REDIS_TEST_URL');
      return;
    }
    // Подадена отвън връзка BullMQ не затваря сам при `close()` — затваря се изрично по-долу,
    // иначе процесът на теста не излиза.
    const queueConnection = new Redis(REDIS_TEST_URL, { maxRetriesPerRequest: null });
    const queue = new Queue(MAINTENANCE_QUEUE, {
      connection: queueConnection,
      prefix: 'cs2dm-test:bull',
    });
    try {
      await redis.set(
        LIVE_KEY,
        JSON.stringify({
          ts: Date.now(),
          map: 'de_dust2',
          mode: 'All Weapons',
          maxPlayers: 20,
          players: [{ isBot: false }],
        }),
        'EX',
        15,
      );
      const live = await new RedisLiveSource(redis).get();
      assert.equal(live.known, true);
      await redis.del(LIVE_KEY);
      assert.deepEqual(await new RedisLiveSource(redis).get(), { known: false });

      await queue.upsertJobScheduler(
        PURGE_JOB,
        { pattern: PURGE_SCHEDULE, tz: 'UTC' },
        { name: PURGE_JOB },
      );
      await queue.upsertJobScheduler(
        PURGE_JOB,
        { pattern: PURGE_SCHEDULE, tz: 'UTC' },
        { name: PURGE_JOB },
      );
      const schedulers = await queue.getJobSchedulers();
      assert.equal(schedulers.length, 1, 'повторният старт не добавя втори планировчик');
    } finally {
      await redis.del(LIVE_KEY);
      await queue.obliterate({ force: true });
      await queue.close();
      queueConnection.disconnect();
      redis.disconnect();
    }
  });
});
