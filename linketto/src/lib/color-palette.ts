// Палитрата и чистата логика на избора на цвят (components/ColorField.tsx). Без DOM — тества се.

export type PaletteGroup = 'vivid' | 'pastel' | 'dark' | 'neutral';

/** Подбрани цветове по групи (по 8 на ред). Работят и на светла, и на тъмна тема. */
export const PALETTE: Record<PaletteGroup, readonly string[]> = {
  vivid: [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  ],
  pastel: ['#fecaca', '#fed7aa', '#fde68a', '#d9f99d', '#bbf7d0', '#a5f3fc', '#c7d2fe', '#fbcfe8'],
  dark: ['#7f1d1d', '#7c2d12', '#713f12', '#14532d', '#134e4a', '#1e3a8a', '#312e81', '#4a044e'],
  neutral: ['#000000', '#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#f3f4f6', '#ffffff'],
};

export const PALETTE_GROUPS: readonly PaletteGroup[] = ['vivid', 'pastel', 'dark', 'neutral'];

/** Строгият формат, който сървърът приема (`#rrggbb`). */
export function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

/**
 * Прощаващ вход → `#rrggbb` (малки букви) или null: „22C55E“, „#22c55e“, „#2c5“, „ 2c5 “.
 * Празно → '' (полето позволява „автоматичен“, ако викащият го приема).
 */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '').toLowerCase();
  if (raw === '') return '';
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${raw.split('').map((c) => c + c).join('')}`;
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/**
 * Доминантните цветове на снимка от RGBA пикселите (canvas getImageData). Квантуване по 5 бита на
 * канал → тежест по брой × наситеност (избягва сивото и почти бялото/черното) → алчен избор на
 * достатъчно различни цветове. Прозрачните пиксели не се броят.
 */
export function dominantColors(pixels: ArrayLike<number>, max = 6): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.n += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { n: 1, r, g, b });
    }
  }
  const scored = [...buckets.values()].map(({ n, r, g, b }) => {
    const [cr, cg, cb] = [r / n, g / n, b / n];
    const hi = Math.max(cr, cg, cb) / 255;
    const lo = Math.min(cr, cg, cb) / 255;
    const light = (hi + lo) / 2;
    const sat = hi === lo ? 0 : (hi - lo) / (1 - Math.abs(2 * light - 1));
    const usable = light > 0.1 && light < 0.93 ? 1 : 0.25;
    return { r: cr, g: cg, b: cb, score: n * (0.3 + sat) * usable };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked: { r: number; g: number; b: number }[] = [];
  for (const c of scored) {
    if (picked.length >= max) break;
    const far = picked.every((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) > 56);
    if (far) picked.push(c);
  }
  return picked.map((c) => toHex(c.r, c.g, c.b));
}

/** Последно избраните: новият отпред, без повторения, най-много `max`. */
export function pushRecent(list: readonly string[], hex: string, max = 8): string[] {
  if (!isHex(hex)) return [...list].slice(0, max);
  const value = hex.toLowerCase();
  return [value, ...list.filter((item) => item.toLowerCase() !== value)].slice(0, max);
}
