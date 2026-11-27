// Картите под съобщенията в Discord: в известията и при добавяне — по една за всеки вид в съобщението,
// със снимката на семената в здравето на най-слабата му партида; в /infosemki — една, на най-ниския процент (assets/seeds/<вид>-<здраве>.jpg — рисувани от същия 3D код като
// дашборда, scripts/render-seeds.ts). Чиста логика: кои карти, с какъв текст; прикачването е в discord/.
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
    const live = ofType.filter((b) => msLeft(b, b.rate, now) > 0);
    // най-слабата е тази с най-нисък процент; ако всички са изтекли — картата е за изтекла
    const weakest = [...live].sort(
      (a, b) => percentAt(a, a.rate, now) - percentAt(b, b.rate, now),
    )[0];
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

// /infosemki: една снимка — партидата с най-нисък процент сред живите (изтеклите са на 0% и иначе
// винаги биха „печелили“); ако живи няма — изтеклата. Непознатите видове нямат снимка.
export function weakestCard(
  batches: readonly BatchLike[],
  labels: SeedLabels,
  now: Date,
): SeedCard | null {
  const known = batches.filter((b) => isSeedKey(b.seedTypeKey));
  const live = known.filter((b) => msLeft(b, b.rate, now) > 0);
  const pool = live.length > 0 ? live : known;
  const weakest = [...pool].sort(
    (a, b) => percentAt(a, a.rate, now) - percentAt(b, b.rate, now) || a.id - b.id,
  )[0];
  if (!weakest) return null;
  const key = weakest.seedTypeKey;
  const p = percentAt(weakest, weakest.rate, now);
  const health = healthOf(p, live.length === 0);
  return {
    typeKey: key,
    title:
      live.length > 0
        ? `Най-нисък процент: ${seedLabel(labels, key)}, ${formatSeeds(weakest.count)} — ${formatPercent(p)} · ${health.label}`
        : `Всички са изтекли: ${seedLabel(labels, key)}`,
    text: '',
    color: Number.parseInt((SEED_COLORS[key] ?? '#898781').slice(1), 16),
    stage: health.stage,
    file: `${key}-${health.stage}.jpg`,
  };
}
