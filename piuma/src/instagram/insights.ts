import { z } from 'zod';
import { GRAPH_HOST, InstagramApiError, instagramRequest } from './client.js';
import type { PublishDeps } from './publish.js';

/**
 * Instagram Insights. `impressions` е спряна (v22, април 2025) — заместена от `views`.
 * Метриките се искат на групи и липсваща/неподдържана група НЕ проваля синхронизацията:
 * различните видове медия поддържат различни метрики, а Meta ги мени по версии.
 */
const insightValueSchema = z.object({
  name: z.string(),
  values: z.array(z.object({ value: z.union([z.number(), z.record(z.unknown())]) })).optional(),
  total_value: z.object({ value: z.number() }).optional(),
});

const insightsEnvelope = z.object({ data: z.array(insightValueSchema).default([]) });

export interface MediaMetrics {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  totalInteractions: number | null;
}

const MEDIA_METRIC_GROUPS: string[][] = [
  ['reach', 'saved', 'shares', 'likes', 'comments', 'total_interactions'],
  ['views'],
];

function numberOf(entry: z.infer<typeof insightValueSchema>): number | null {
  if (entry.total_value) return entry.total_value.value;
  const first = entry.values?.[0]?.value;
  return typeof first === 'number' ? first : null;
}

async function fetchGroup(
  deps: PublishDeps,
  path: string,
  metrics: string[],
  extra: Record<string, string> = {},
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  try {
    const result = await instagramRequest(
      `${GRAPH_HOST}/${deps.cfg.IG_GRAPH_VERSION}/${path}`,
      insightsEnvelope,
      {
        query: { metric: metrics.join(','), access_token: deps.accessToken, ...extra },
        fetchImpl: deps.fetchImpl,
      },
    );
    for (const entry of result.data) out.set(entry.name, numberOf(entry));
  } catch (error) {
    // 400 „metric not supported for this media type“ е нормален случай, не провал.
    if (!(error instanceof InstagramApiError && error.httpStatus === 400)) throw error;
  }
  return out;
}

export async function fetchMediaInsights(
  deps: PublishDeps,
  igMediaId: string,
): Promise<MediaMetrics> {
  const merged = new Map<string, number | null>();
  for (const group of MEDIA_METRIC_GROUPS) {
    for (const [k, v] of await fetchGroup(deps, `${igMediaId}/insights`, group)) merged.set(k, v);
  }
  const pick = (name: string): number | null => merged.get(name) ?? null;
  return {
    views: pick('views'),
    reach: pick('reach'),
    likes: pick('likes'),
    comments: pick('comments'),
    saved: pick('saved'),
    shares: pick('shares'),
    totalInteractions: pick('total_interactions'),
  };
}

export interface AccountMetrics {
  reach: number | null;
  views: number | null;
  followerCount: number | null;
  engaged: number | null;
}

/** Дневни метрики на акаунта за вчерашния/днешния ден (Meta дава плаващи прозорци по `period`). */
export async function fetchAccountInsights(deps: PublishDeps): Promise<AccountMetrics> {
  const path = `${deps.igUserId}/insights`;
  const daily = await fetchGroup(deps, path, ['reach', 'follower_count'], { period: 'day' });
  const totals = await fetchGroup(deps, path, ['views', 'accounts_engaged'], {
    period: 'day',
    metric_type: 'total_value',
  });
  return {
    reach: daily.get('reach') ?? null,
    followerCount: daily.get('follower_count') ?? null,
    views: totals.get('views') ?? null,
    engaged: totals.get('accounts_engaged') ?? null,
  };
}
