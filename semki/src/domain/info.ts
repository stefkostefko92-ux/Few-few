// /infosemki като карти (embed) в Discord — по една за вид: в заглавието видът, колко семки в колко
// партиди и скоростта; в текста всяка партида на свой ред, като в „Партиди“ (здраве, брой, %, колко
// остава, кога изтича); снимката е на най-ниската партида от вида. Без номера на партидите.
// Лимитите на Discord се пазят тук: текст на карта ≤ 4096, до 10 карти и ≤ 6000 знака в съобщение.
// Чиста логика; прикачването на снимките е в discord/cards.ts.
import type { BatchLike } from './alerts.js';
import { weakestLive } from './cards.js';
import { SEED_COLORS } from './chart.js';
import { expiresAt, percentAt } from './decay.js';
import { healthOf } from './health.js';
import {
  batchStatus,
  chunkLines,
  formatBatches,
  formatNumber,
  formatPercent,
  formatSeeds,
  healthDot,
  seedLabel,
  type SeedLabels,
} from './messages.js';
import { isSeedKey } from './seeds.js';

export const EMBED_TEXT_LIMIT = 4096;
export const EMBEDS_PER_MESSAGE = 10;
export const MESSAGE_EMBEDS_LIMIT = 6000;

export interface InfoEmbed {
  title: string;
  description: string;
  color: number;
  footer?: string;
  image?: string; // „ak-aging.jpg“ от assets/seeds
}

export interface InfoMessage {
  content: string; // само в първото съобщение — „Общо — …“
  embeds: InfoEmbed[];
}

const seedsIn = (list: readonly BatchLike[]) =>
  `${formatSeeds(list.reduce((sum, b) => sum + b.count, 0))} в ${formatBatches(list.length)}`;

const embedSize = (e: InfoEmbed) => e.title.length + e.description.length + (e.footer?.length ?? 0);

// Картите на един вид: първата носи снимката и бележката под нея, останалите са „(продължение)“.
function typeEmbeds(
  key: string,
  ofType: readonly BatchLike[],
  labels: SeedLabels,
  now: Date,
): InfoEmbed[] {
  const sorted = [...ofType].sort(
    (a, b) => expiresAt(a, a.rate).getTime() - expiresAt(b, b.rate).getTime(),
  );
  const rate = sorted[0]?.rate;
  const speed = rate ? ` · ${formatNumber(rate.decayPercent)}% на ${rate.decayMinutes} мин` : '';
  const title = `${seedLabel(labels, key)} — ${seedsIn(sorted)}${speed}`;
  const weakest = weakestLive(sorted, now);
  const p = weakest ? percentAt(weakest, weakest.rate, now) : 0;
  const health = healthOf(p, !weakest);
  const footer = weakest
    ? `На снимката: най-ниската — ${formatSeeds(weakest.count)}, ${formatPercent(p)} (${health.label})`
    : 'На снимката: изтекли семки';
  const color = Number.parseInt((SEED_COLORS[key] ?? '#898781').slice(1), 16);
  const chunks = chunkLines(
    sorted.map((b) => `${healthDot(b, now)} ${batchStatus(b, now)}`),
    EMBED_TEXT_LIMIT,
  );
  return chunks.map((description, i) =>
    i === 0
      ? {
          title,
          description,
          color,
          footer,
          ...(isSeedKey(key) ? { image: `${key}-${health.stage}.jpg` } : {}),
        }
      : { title: `${title} (продължение)`, description, color },
  );
}

export function buildInfoEmbeds(
  batches: readonly BatchLike[],
  labels: SeedLabels,
  now: Date,
): InfoMessage[] {
  if (batches.length === 0) return [{ content: 'Няма въведени семки.', embeds: [] }];
  const order = Object.keys(labels);
  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };
  const keys = [...new Set(batches.map((b) => b.seedTypeKey))].sort((a, b) => rank(a) - rank(b));
  const embeds = keys.flatMap((key) =>
    typeEmbeds(
      key,
      batches.filter((b) => b.seedTypeKey === key),
      labels,
      now,
    ),
  );
  // Карти → съобщения: до 10 карти и до 6000 знака в едно.
  const messages: InfoMessage[] = [{ content: `**Общо** — ${seedsIn(batches)}`, embeds: [] }];
  let used = 0;
  for (const e of embeds) {
    let current = messages[messages.length - 1] as InfoMessage;
    if (
      current.embeds.length >= EMBEDS_PER_MESSAGE ||
      (current.embeds.length > 0 && used + embedSize(e) > MESSAGE_EMBEDS_LIMIT)
    ) {
      current = { content: '', embeds: [] };
      messages.push(current);
      used = 0;
    }
    current.embeds.push(e);
    used += embedSize(e);
  }
  return messages;
}

// Същото съобщение като обикновен текст — ако Discord откаже картите (никога без справка).
export function infoAsText(message: InfoMessage): string[] {
  const lines = message.content ? [message.content] : [];
  for (const e of message.embeds) {
    if (lines.length > 0) lines.push('');
    lines.push(`**${e.title}**`, ...e.description.split('\n'));
  }
  return chunkLines(lines);
}
