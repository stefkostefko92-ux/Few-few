// config.js — константи на галактическата сцена. Чист JS, тестваем без GPU.

// Нива на качество (0 = пълно, по-високо = по-олекотено). nebAdaptQuality превключва
// между тях с хистерезис (виж quality.js) — октави на FBM, звездни слоеве, резолюция на bloom.
export const QUALITY_TIERS = [
  { oct: 6, stars: 3, resScale: 1.0, history: true },
  { oct: 5, stars: 3, resScale: 0.72, history: true },
  { oct: 3, stars: 2, resScale: 0.5, history: false },
];

export const FPS_LOW = 42;
export const FPS_HIGH = 56;
export const FPS_HYSTERESIS_MS = 1200;
export const FPS_EMA_ALPHA = 0.06;

// Диафракционни лъчи (JWST-стил, 6 основни хексагонални + 2 вертикални) — само за най-ярките
// фонови звезди (горен процентил на bMag в шейдъра). Ъглите тук документират геометрията,
// използвана и в GLSL низа (glsl-galaxy.js) — държим ги на едно място, за да не се разминат.
export const SPIKE_ANGLES = [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI / 2];
export const SPIKE_BRIGHT_THRESHOLD = 0.9;
