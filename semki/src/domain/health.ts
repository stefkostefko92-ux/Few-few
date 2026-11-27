// Здравето на семето по трайността: какво показва дашбордът — как изглежда семето в 3D, етикетът и
// цветът. Свежото е лъскаво и твърдо; колкото по-ниско е, толкова повече потъмнява, набръчква се и хваща
// плесен. Изтеклото е сиво и сбръчкано. Чиста логика, без I/O.

export type HealthStage = 'fresh' | 'healthy' | 'aging' | 'spoiling' | 'rotting' | 'dead';

export interface Health {
  stage: HealthStage;
  label: string;
  // 0 — съвсем свежо, 1 — напълно развалено; управлява вида на семето в 3D.
  decay: number;
}

// Долната граница на всяка степен в %, включително; под 10% до изтичането — „Гние“.
export const HEALTH_BANDS: ReadonlyArray<{ stage: HealthStage; min: number; label: string }> = [
  { stage: 'fresh', min: 75, label: 'Свежа' },
  { stage: 'healthy', min: 50, label: 'Здрава' },
  { stage: 'aging', min: 25, label: 'Остарява' },
  { stage: 'spoiling', min: 10, label: 'Разваля се' },
  { stage: 'rotting', min: 0, label: 'Гние' },
];

const DEAD: Health = { stage: 'dead', label: 'Изтекла', decay: 1 };
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export function healthOf(percent: number, expired: boolean): Health {
  if (expired || !(percent > 0)) return DEAD;
  const p = Math.min(100, percent);
  const band = HEALTH_BANDS.find((b) => p >= b.min) ?? HEALTH_BANDS[HEALTH_BANDS.length - 1];
  return {
    stage: band?.stage ?? 'rotting',
    label: band?.label ?? 'Гние',
    decay: round3(1 - p / 100),
  };
}

// Легендата под рафтовете: по едно семе за всяка степен, в средата на диапазона ѝ.
export const HEALTH_LEGEND: ReadonlyArray<{
  stage: HealthStage;
  label: string;
  range: string;
  decay: number;
  dead: boolean;
}> = [
  { stage: 'fresh', label: 'Свежа', range: '75–100%', decay: 0.08, dead: false },
  { stage: 'healthy', label: 'Здрава', range: '50–75%', decay: 0.38, dead: false },
  { stage: 'aging', label: 'Остарява', range: '25–50%', decay: 0.62, dead: false },
  { stage: 'spoiling', label: 'Разваля се', range: '10–25%', decay: 0.82, dead: false },
  { stage: 'rotting', label: 'Гние', range: 'под 10%', decay: 0.95, dead: false },
  { stage: 'dead', label: 'Изтекла', range: '0%', decay: 1, dead: true },
];
