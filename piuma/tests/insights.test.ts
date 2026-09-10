import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig, type AppConfig } from '../src/config.js';
import { fetchAccountInsights, fetchMediaInsights } from '../src/instagram/insights.js';
import type { PublishDeps } from '../src/instagram/publish.js';
import { performanceContext, type PostPerformance } from '../src/services/insights.js';

const cfg: AppConfig = loadConfig({
  NODE_ENV: 'test',
  PUBLIC_BASE_URL: 'https://piuma.example.com',
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/db',
  REDIS_URL: 'redis://127.0.0.1:6379/3',
  IG_APP_ID: '123456',
  IG_APP_SECRET: 'app-secret',
  IG_REDIRECT_URI: 'https://piuma.example.com/auth/instagram/callback',
  TOKEN_ENC_KEY: 'a'.repeat(64),
} as NodeJS.ProcessEnv);

function stub(responses: Array<{ status?: number; json: unknown }>): {
  fetchImpl: typeof fetch;
  urls: string[];
} {
  const urls: string[] = [];
  let i = 0;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const entry = responses[i++];
    if (!entry) throw new Error('неочаквана заявка');
    urls.push(String(input));
    return new Response(JSON.stringify(entry.json), {
      status: entry.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, urls };
}

function deps(fetchImpl: typeof fetch): PublishDeps {
  return { cfg, igUserId: '178', accessToken: 'tok', fetchImpl };
}

test('метриките на медия се събират от две групи; неподдържана група не проваля', async () => {
  const { fetchImpl, urls } = stub([
    {
      json: {
        data: [
          { name: 'reach', values: [{ value: 1200 }] },
          { name: 'likes', values: [{ value: 80 }] },
          { name: 'total_interactions', values: [{ value: 95 }] },
        ],
      },
    },
    { status: 400, json: { error: { message: 'Unsupported metric', code: 100 } } },
  ]);
  const metrics = await fetchMediaInsights(deps(fetchImpl), '179');
  assert.equal(metrics.reach, 1200);
  assert.equal(metrics.likes, 80);
  assert.equal(metrics.totalInteractions, 95);
  assert.equal(metrics.views, null);
  assert.equal(metrics.saved, null);
  assert.match(
    urls[0]!,
    /\/v24\.0\/179\/insights\?metric=reach%2Csaved%2Cshares%2Clikes%2Ccomments%2Ctotal_interactions/,
  );
  assert.doesNotMatch(urls[0]!, /impressions/);
});

test('грешка, различна от 400, се вдига нагоре', async () => {
  const { fetchImpl } = stub([{ status: 500, json: { error: { message: 'boom' } } }]);
  await assert.rejects(fetchMediaInsights(deps(fetchImpl), '179'), /boom/);
});

test('метриките на акаунта: дневни + total_value', async () => {
  const { fetchImpl, urls } = stub([
    {
      json: {
        data: [
          { name: 'reach', values: [{ value: 340 }] },
          { name: 'follower_count', values: [{ value: 5 }] },
        ],
      },
    },
    {
      json: {
        data: [
          { name: 'views', total_value: { value: 900 } },
          { name: 'accounts_engaged', total_value: { value: 41 } },
        ],
      },
    },
  ]);
  const metrics = await fetchAccountInsights(deps(fetchImpl));
  assert.deepEqual(metrics, { reach: 340, followerCount: 5, views: 900, engaged: 41 });
  assert.match(urls[1]!, /metric_type=total_value/);
  assert.match(urls[1]!, /period=day/);
});

test('контекстът за модела: топ, слаби и форматът с повече обхват', () => {
  const row = (
    id: string,
    kind: 'IMAGE' | 'REELS',
    reach: number,
    rate: number,
  ): PostPerformance => ({
    id,
    kind,
    caption: `caption ${id}`,
    permalink: null,
    publishedAt: null,
    reach,
    views: 0,
    interactions: Math.round((reach * rate) / 100),
    engagementRate: rate,
    fetchedAt: new Date(),
  });
  const rows = [
    row('1', 'REELS', 2000, 9),
    row('2', 'IMAGE', 800, 6),
    row('3', 'REELS', 1500, 4),
    row('4', 'IMAGE', 300, 1),
    row('5', 'IMAGE', 200, 0.5),
  ];
  const ctx = performanceContext(rows, 2, 2);
  assert.deepEqual(
    ctx.top.map((t) => t.caption),
    ['caption 1', 'caption 2'],
  );
  assert.deepEqual(
    ctx.weak.map((t) => t.caption),
    ['caption 4', 'caption 5'],
  );
  assert.equal(ctx.bestKind, 'REELS');
  assert.deepEqual(performanceContext([]).top, []);
  assert.equal(performanceContext([row('1', 'IMAGE', 10, 1)]).bestKind, null);
});
