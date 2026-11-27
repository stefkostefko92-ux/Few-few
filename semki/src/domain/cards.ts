// Картите под съобщенията в Discord: по една за всеки вид в съобщението, със снимката на семената в
// здравето на най-слабата му партида (assets/seeds/<вид>-<здраве>.jpg — рисувани от същия 3D код като
// дашборда, scripts/render-seeds.ts). Чиста логика: кои карти, с какъв текст; прикачването е в discord/.
import type { BatchLike } from './alerts.js';
import { SEED_COLORS } from './chart.js';
import { msLeft, percentAt } from './decay.js';
import { healthOf, type HealthStage } from './health.js';
import { formatPercent, seedLabel, type SeedLabels } from './messages.js';
import { isSeedKey } from './seeds.js';

export interface SeedCard {
  typeKey: string;
  title: string; // „Purple — Гние“
  text: string; // „2 партиди, 9 семки · най-слабата #8 — 9,50%“
  color: number; // цветът на вида за лентата на картата
  stage: HealthStage;
  file: string; // „purple-rotting.jpg“
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
    const live = ofType.filter((b) => msLeft(b, b.rate, now) > 0);
    // най-слабата е тази с най-нисък процент; ако всички са изтекли — картата е за изтекла
    const weakest = [...live].sort(
      (a, b) => percentAt(a, a.rate, now) - percentAt(b, b.rate, now),
    )[0];
    const p = weakest ? percentAt(weakest, weakest.rate, now) : 0;
    const health = healthOf(p, !weakest);
    const seeds = ofType.reduce((s, b) => s + b.count, 0);
    const head = `${plural(ofType.length, 'партида', 'партиди')}, ${plural(seeds, 'семка', 'семки')}`;
    return {
      typeKey: key,
      title: `${seedLabel(labels, key)} — ${health.label}`,
      text: weakest
        ? ofType.length > 1
          ? `${head} · най-слабата #${weakest.id} — ${formatPercent(p)}`
          : `${head} · #${weakest.id} — ${formatPercent(p)}`
        : `${head} · всички са изтекли`,
      color: Number.parseInt((SEED_COLORS[key] ?? '#898781').slice(1), 16),
      stage: health.stage,
      file: `${key}-${health.stage}.jpg`,
    };
  });
}
