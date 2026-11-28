// Картите под съобщенията в Discord (известията и отговорът при добавяне): по една за всеки вид в
// съобщението, със снимката на семената в здравето на най-слабата му партида (assets/seeds/<вид>-<здраве>.jpg
// — рисувани от същия 3D код като дашборда, scripts/render-seeds.ts). /infosemki е в info.ts.
// Чиста логика: кои карти, с какъв текст; прикачването е в discord/.
import type { BatchLike } from './alerts.js';
import { SEED_COLORS } from './chart.js';
import { msLeft, percentAt } from './decay.js';
import { healthOf, type HealthStage } from './health.js';
import {
  formatBatches,
  formatPercent,
  formatSeeds,
  seedLabel,
  type SeedLabels,
} from './messages.js';
import { isSeedKey } from './seeds.js';

export interface SeedCard {
  typeKey: string;
  title: string; // „Purple — Гние“
  text: string; // „2 партиди, 9 семки · най-слабата: 3 семки — 9,50%“
  color: number; // цветът на вида за лентата на картата
  stage: HealthStage;
  file: string; // „purple-rotting.jpg“
}

export function seedCards(
  batches: readonly BatchLike[],
  labels: SeedLabels,
  now: Date,
): SeedCard[] {
  const order = Object.keys(labels);
  const keys = [...new Set(batches.map((b) => b.seedTypeKey))]
    .filter(isSeedKey)
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return keys.map((key) => {
    const ofType = batches.filter((b) => b.seedTypeKey === key);
    // ако всички са изтекли — картата е за изтекла
    const weakest = weakestLive(ofType, now);
    const p = weakest ? percentAt(weakest, weakest.rate, now) : 0;
    const health = healthOf(p, !weakest);
    const seeds = ofType.reduce((s, b) => s + b.count, 0);
    const head = `${formatBatches(ofType.length)}, ${formatSeeds(seeds)}`;
    return {
      typeKey: key,
      title: `${seedLabel(labels, key)} — ${health.label}`,
      text: weakest
        ? ofType.length > 1
          ? `${head} · най-слабата: ${formatSeeds(weakest.count)} — ${formatPercent(p)}`
          : `${head} — ${formatPercent(p)}`
        : `${head} · всички са изтекли`,
      color: Number.parseInt((SEED_COLORS[key] ?? '#898781').slice(1), 16),
      stage: health.stage,
      file: `${key}-${health.stage}.jpg`,
    };
  });
}

// Най-слабата жива партида: най-нисък процент (при равенство — по-старият запис). Изтеклите са на 0% и
// иначе винаги биха я заемали; undefined — живи няма.
export function weakestLive(batches: readonly BatchLike[], now: Date): BatchLike | undefined {
  return batches
    .filter((b) => msLeft(b, b.rate, now) > 0)
    .sort((a, b) => percentAt(a, a.rate, now) - percentAt(b, b.rate, now) || a.id - b.id)[0];
}
