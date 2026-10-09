import type { PostKind } from '@prisma/client';
import type { PostPerformance } from './insights.js';

/*
 * Какво научаваме от СОБСТВЕНИТЕ числа: кога и какъв формат работи за този акаунт.
 *
 * Мярката е ангажираност/обхват, не суров обхват. Обхватът расте заедно с броя
 * последователи, тоест пост от третия месец бие пост от първия просто защото акаунтът е
 * пораснал — сравнението по обхват мери растежа, не съдържанието. Съотношението маха това.
 *
 * ЧЕСТНОСТ ЗА ИЗВАДКАТА. Това е класация с видими бройки, НЕ тест за значимост. При
 * 4 публикации/седмица една кофа събира шепа постове за месеци — на такъв обем няма
 * почтен p-value. Затова: всяка кофа носи своето `posts`, извод се дава само при
 * достатъчно данни И ясна преднина, а иначе се казва „рано е“ вместо да се измисля
 * увереност. По-добре празен извод, отколкото уверено грешен.
 */

/** Колко публикации иска една кофа, преди изобщо да се сравнява. */
const MIN_PER_BUCKET = 6;
/** Колко кофи трябва да са сравними, за да има какво да се сравнява. */
const MIN_COMPARABLE = 2;
/** С колко (относително) лидерът трябва да бие останалите, за да не е шум. */
const MIN_MARGIN = 0.15;

/**
 * Степени на увереност — стълбата, която пази от уверено гадаене.
 * `none` няма данни · `early` има, но малко · `ready` стига за извод.
 */
export type Confidence = 'none' | 'early' | 'ready';

/** Защо е тази степен. Кодове, не текст — панелът ги превежда, услугата не пише UI. */
export type Reason = 'no-posts' | 'too-few' | 'no-clear-winner' | 'ok';

export interface DayPart {
  /** Ключ за превод; границите са в часовника на планировчика. */
  key: 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
  fromHour: number;
  toHour: number;
}

/**
 * Пет пояса вместо 24 часа × 7 дни. Решетка 7×24 е 168 кофи — при реален обем всяка
 * събира по нула-един пост и класацията става жребий. Пет пояса пълнят кофите достатъчно,
 * за да значат нещо, и се превеждат право в `postingTimes`.
 */
export const DAY_PARTS: readonly DayPart[] = [
  { key: 'morning', fromHour: 6, toHour: 11 },
  { key: 'midday', fromHour: 11, toHour: 15 },
  { key: 'afternoon', fromHour: 15, toHour: 19 },
  { key: 'evening', fromHour: 19, toHour: 23 },
  { key: 'night', fromHour: 23, toHour: 6 },
];

export interface Bucket<T> {
  value: T;
  /** Брой публикации в кофата — винаги видим, защото извода зависи от него. */
  posts: number;
  /** Медиана на ангажираността (%). Медиана, не средно: един вирусен пост дърпа средното. */
  medianRate: number;
}

export interface Finding<T> {
  confidence: Confidence;
  reason: Reason;
  /** Всички кофи с данни, подредени по медиана — човек вижда числата, не само извода. */
  buckets: Array<Bucket<T>>;
  /** Победителят — само при `ready`. При `early` нарочно е `null`. */
  best: T | null;
}

export interface Learned {
  /** Колко публикувани поста с метрики стоят зад всичко долу. */
  sample: number;
  /**
   * Часовникът, в който са смятани поясите — същият, с който `nextSlots` насрочва
   * (локалното време на процеса). Показва се, за да се види дали съвпада с часовата зона
   * на публиката: сървър на UTC и българска аудитория се разминават с 2–3 часа.
   */
  timezone: string;
  timing: Finding<DayPart['key']>;
  format: Finding<PostKind>;
  topic: Finding<string>;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return Math.round(value * 10) / 10;
}

/** В кой пояс пада часът. Нощта минава през полунощ, затова е отделен случай. */
export function dayPartOf(hour: number): DayPart['key'] {
  for (const part of DAY_PARTS) {
    if (part.key === 'night') continue;
    if (hour >= part.fromHour && hour < part.toHour) return part.key;
  }
  return 'night';
}

/**
 * Групира по ключ и решава има ли извод. Сърцевината на честността е тук: кофа под
 * прага не участва в сравнението, а лидер без ясна преднина не се обявява за победител.
 */
function judge<T>(rows: Array<{ key: T; rate: number }>): Finding<T> {
  if (rows.length === 0) {
    return { confidence: 'none', reason: 'no-posts', buckets: [], best: null };
  }

  const grouped = new Map<T, number[]>();
  for (const row of rows) {
    const list = grouped.get(row.key);
    if (list) list.push(row.rate);
    else grouped.set(row.key, [row.rate]);
  }

  const buckets: Array<Bucket<T>> = [...grouped.entries()]
    .map(([value, rates]) => ({ value, posts: rates.length, medianRate: median(rates) }))
    .sort((a, b) => b.medianRate - a.medianRate || b.posts - a.posts);

  const comparable = buckets.filter((bucket) => bucket.posts >= MIN_PER_BUCKET);
  if (comparable.length < MIN_COMPARABLE) {
    // Има данни, но не стигат за сравнение — показваме ги и мълчим за извода.
    return { confidence: 'early', reason: 'too-few', buckets, best: null };
  }

  const [leader, ...rest] = comparable;
  if (!leader) return { confidence: 'early', reason: 'too-few', buckets, best: null };
  const field = median(rest.map((bucket) => bucket.medianRate));
  // Преднина под прага е шум при тези бройки, не откритие.
  if (field <= 0 || leader.medianRate < field * (1 + MIN_MARGIN)) {
    return { confidence: 'early', reason: 'no-clear-winner', buckets, best: null };
  }

  return { confidence: 'ready', reason: 'ok', buckets, best: leader.value };
}

/**
 * Чете публикуваните постове с метрики и вади трите извода. Работи върху вече сметнатия
 * `PostPerformance` — същите числа, които панелът показва, за да няма два източника на истина.
 */
export function learnFrom(rows: readonly PostPerformance[]): Learned {
  // Обхват 0 значи липсваща метрика — делението няма смисъл, редът не участва никъде.
  const usable = rows.filter((row) => row.reach > 0);
  // Часът трябва само на поясите. Форматът и темата се четат и от пост без точно време,
  // иначе една липсваща дата изхвърля напълно годен ред от сравнението.
  const timed = usable.filter(
    (row): row is PostPerformance & { publishedAt: Date } => row.publishedAt !== null,
  );

  const timing = judge(
    timed.map((row) => ({
      // Локалният часовник нарочно — `nextSlots` насрочва със `setHours` в същия. Анализ в
      // UTC би дал пояс, който планировчикът после мести с часове.
      key: dayPartOf(row.publishedAt.getHours()),
      rate: row.engagementRate,
    })),
  );

  const format = judge(usable.map((row) => ({ key: row.kind, rate: row.engagementRate })));

  const topic = judge(
    usable
      .filter((row): row is PostPerformance & { topic: string } => Boolean(row.topic))
      .map((row) => ({ key: row.topic, rate: row.engagementRate })),
  );

  return {
    sample: usable.length,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timing,
    format,
    topic,
  };
}

/**
 * Часовете, които `postingTimes` би получил от извода — средата на печелившия пояс.
 * Празен масив при недостатъчно данни: планът не се пипа на догадка.
 */
export function suggestedTimes(learned: Learned): string[] {
  if (learned.timing.confidence !== 'ready' || !learned.timing.best) return [];
  const part = DAY_PARTS.find((candidate) => candidate.key === learned.timing.best);
  if (!part) return [];
  const span =
    part.key === 'night' ? 24 - part.fromHour + part.toHour : part.toHour - part.fromHour;
  const middle = (part.fromHour + Math.floor(span / 2)) % 24;
  return [`${String(middle).padStart(2, '0')}:00`];
}
