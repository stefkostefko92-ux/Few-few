import { z } from 'zod';

/**
 * План за поддръжка на управлявана страница. Живее в `Brand.plan` (Json) и се валидира
 * на всеки вход — панелът пише, автопилотът и агентът четат.
 */
export const brandPlanSchema = z.object({
  /** Публикации на седмица, които автопилотът предлага като чернови. */
  postsPerWeek: z.number().int().min(1).max(14).default(3),
  /** Дял на Reels спрямо снимки (0–1). */
  reelsShare: z.number().min(0).max(1).default(0.5),
  /** Тематични стълбове — автопилотът ги редува. */
  pillars: z.array(z.string().min(2).max(80)).min(1).max(8),
  /** Предпочитани часове за публикуване, локално време, „HH:MM“. */
  postingTimes: z
    .array(z.string().regex(/^\d{2}:\d{2}$/))
    .min(1)
    .max(7)
    .default(['08:30', '20:00']),
  /** Хаштаг набори (по един на ред) — нишови, 3-5 на пост. */
  hashtagSets: z.array(z.array(z.string().min(2))).default([]),
  /** Призив за действие, който се вплита без да убива обхвата. */
  cta: z.string().max(200).default(''),
  /** Цели с думи — влизат в промпта, не в отчет. */
  goals: z.string().max(1000).default(''),
  /** Ключови думи за social SEO — в caption-а, не само в хаштаговете. */
  keywords: z.array(z.string().min(2).max(60)).max(20).default([]),
  /** Табу-теми/формулировки. */
  avoid: z.string().max(1000).default(''),
  /** Кои платформи да получат адаптиран вариант на текста при всяка чернова. */
  crossPost: z.array(z.enum(['facebook', 'tiktok', 'linkedin', 'x'])).default(['facebook']),
  /**
   * Медийна библиотека — реални материали на бранда (https). Автопилотът НЕ измисля снимки:
   * без материал няма чернова. Редува ги, най-отдавна ползваният е пръв.
   */
  assets: z
    .array(
      z.object({
        url: z.string().url(),
        kind: z.enum(['IMAGE', 'REELS']).default('IMAGE'),
        description: z.string().min(3).max(500),
        coverUrl: z.string().url().optional(),
      }),
    )
    .max(200)
    .default([]),
});

export type BrandAsset = BrandPlan['assets'][number];
export const CROSS_POST_PLATFORMS = ['facebook', 'tiktok', 'linkedin', 'x'] as const;
export type CrossPostPlatform = (typeof CROSS_POST_PLATFORMS)[number];

export type BrandPlan = z.infer<typeof brandPlanSchema>;
export type BrandPlanInput = z.input<typeof brandPlanSchema>;

export function parsePlan(raw: unknown): BrandPlan | null {
  const result = brandPlanSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/** От формата на панела (текстови полета) към план. */
export function planFromForm(body: Record<string, unknown>): BrandPlanInput {
  const text = (key: string): string =>
    typeof body[key] === 'string' ? (body[key] as string).trim() : '';
  const lines = (key: string): string[] =>
    text(key)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  const list = (key: string): string[] =>
    text(key)
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  const crossPost = Array.isArray(body.crossPost)
    ? body.crossPost.map(String)
    : typeof body.crossPost === 'string'
      ? [body.crossPost]
      : [];
  return {
    postsPerWeek: Number(text('postsPerWeek') || 3),
    reelsShare: Number(text('reelsShare') || 0.5),
    pillars: lines('pillars'),
    postingTimes: list('postingTimes').length ? list('postingTimes') : undefined,
    hashtagSets: lines('hashtagSets').map((line) =>
      line
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)),
    ),
    cta: text('cta'),
    goals: text('goals'),
    keywords: list('keywords'),
    avoid: text('avoid'),
    crossPost: crossPost as BrandPlanInput['crossPost'],
    assets: lines('assets').map(parseAssetLine),
  };
}

/**
 * Ред от библиотеката: `URL | описание` или `REELS URL | описание | cover URL`.
 * Връща суров обект — валидацията е на схемата, тук само разпознаваме частите.
 */
export interface AssetLine {
  url: string;
  kind: 'IMAGE' | 'REELS';
  description: string;
  coverUrl?: string;
}

export function parseAssetLine(line: string): AssetLine {
  const parts = line.split('|').map((part) => part.trim());
  let head = parts[0] ?? '';
  let kind: 'IMAGE' | 'REELS' = 'IMAGE';
  const kindMatch = head.match(/^(IMAGE|REELS)\s+(.+)$/i);
  if (kindMatch) {
    kind = kindMatch[1]!.toUpperCase() as 'IMAGE' | 'REELS';
    head = kindMatch[2]!.trim();
  }
  const description = parts[1] ?? '';
  const coverUrl = parts[2];
  return { url: head, kind, description, ...(coverUrl ? { coverUrl } : {}) };
}

/** Обратното на `parseAssetLine` — за предварително попълване на формата. */
export function assetToLine(asset: BrandAsset): string {
  const head = asset.kind === 'REELS' ? `REELS ${asset.url}` : asset.url;
  return [head, asset.description, ...(asset.coverUrl ? [asset.coverUrl] : [])].join(' | ');
}
