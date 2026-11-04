// Формата на стъкленицата и къде стоят разтворът и семената. Мерките са в CSS пиксели: сцената е 1:1 с
// пикселите на страницата в равнината z = 0 (там е оста на всяка стъкленица). Чиста математика без three,
// за да се тества в Node.

export const TUBE = {
  outer: 21, // външен радиус
  wall: 1.6,
  height: 172, // от дъното до устието
  fillTop: 150, // нивото на разтвора при 100 % (под тапата)
} as const;

export const INNER = TUBE.outer - TUBE.wall;
export const FILL_BOTTOM = TUBE.wall + 0.35;
export const CORK = { top: 17.9, bottom: 17.1, height: 27, inside: 13 } as const;
// Семето: полуосите на елипсоида (дължина, дебелина, ширина).
export const SEED = { x: 4.3, y: 2.7, z: 3.0 } as const;
// Слотът на стъкленицата в разметката (.vial-slot) и височината на дъската в него.
export const SLOT = { width: 64, height: 210, floor: 203 } as const;

export type ProfilePoint = [x: number, y: number];

// Вътрешният радиус на височина y от дъното: долу стъклото е полукълбо с център на височина outer.
export function innerRadiusAt(y: number): number {
  const d = TUBE.outer - y;
  if (d <= 0) return INNER;
  return d >= INNER ? 0 : Math.sqrt(INNER * INNER - d * d);
}

export function liquidTop(level: number): number {
  return FILL_BOTTOM + Math.max(0, Math.min(1, level)) * (TUBE.fillTop - FILL_BOTTOM);
}

function arc(radius: number, from: number, to: number, steps: number): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps;
    out.push([Math.max(0, radius * Math.cos(t)), TUBE.outer + radius * Math.sin(t)]);
  }
  return out;
}

// Профилът на стъклото за LatheGeometry: отвън нагоре, през извитото устие, отвътре надолу.
export function glassProfile(): ProfilePoint[] {
  const R = TUBE.outer;
  const H = TUBE.height;
  return [
    ...arc(R, -Math.PI / 2, 0, 16),
    [R, H],
    [R + 0.7, H + 0.5],
    [R + 1.0, H + 1.5],
    [R + 0.6, H + 2.4],
    [R - 0.4, H + 2.7],
    [INNER + 0.3, H + 2.2],
    [INNER, H + 1.2],
    [INNER, H - 0.5],
    ...arc(INNER, 0, -Math.PI / 2, 16),
  ];
}

// Профилът на разтвора: по вътрешността на стъклото до нивото, отгоре — мениск (водата се качва
// по стъклото и хлътва към средата).
export function liquidProfile(level: number): ProfilePoint[] {
  const top = liquidTop(level);
  const r0 = INNER - 0.3;
  const pts = arc(r0, -Math.PI / 2, 0, 16).filter(([, y]) => y < top);
  const rTop = Math.max(0.5, innerRadiusAt(top) - 0.3);
  const rise = Math.min(1.2, rTop * 0.08);
  pts.push(
    [rTop, top + rise],
    [rTop * 0.86, top + rise * 0.1],
    [rTop * 0.55, top - 0.4],
    [0, top - 0.5],
  );
  return pts;
}

export interface SeedSpot {
  u: number;
  angle: number;
  radial: number;
}

// Къде е семето: в разтвора — между дъното и малко под повърхността; в изтеклата — на дъното.
// Никога не излиза от стъклото: оставя място за дължината си.
export function seedPosition(
  s: SeedSpot,
  level: number,
  expired: boolean,
): [x: number, y: number, z: number] {
  const yMin = FILL_BOTTOM + SEED.y + 0.4;
  const yMax = expired ? yMin + 1.5 : Math.max(yMin, liquidTop(level) - SEED.x - 0.5);
  const y = yMin + Math.max(0, Math.min(1, s.u)) * (yMax - yMin);
  const room = Math.max(0, innerRadiusAt(y) - SEED.x - 0.8);
  const r = Math.max(0, Math.min(1, s.radial)) * room;
  return [Math.cos(s.angle) * r, y, Math.sin(s.angle) * r];
}
