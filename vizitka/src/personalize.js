// Персонализация на визитката: собствен цвят, форма на аватара, шрифт.
export const AVATAR_SHAPES = [
  { id: 'circle', label: 'Кръг' },
  { id: 'rounded', label: 'Заоблен квадрат' },
  { id: 'square', label: 'Квадрат' },
];

export const FONTS = [
  { id: 'system', label: 'Модерен (по подразбиране)' },
  { id: 'serif', label: 'Класически (серифен)' },
  { id: 'rounded', label: 'Заоблен' },
  { id: 'mono', label: 'Технически (моноширинен)' },
];

const SHAPE_IDS = new Set(AVATAR_SHAPES.map((s) => s.id));
const FONT_IDS = new Set(FONTS.map((f) => f.id));

export const normalizeShape = (v) => (SHAPE_IDS.has(v) ? v : 'circle');
export const normalizeFont = (v) => (FONT_IDS.has(v) ? v : 'system');

// Собствен цвят: приема се само валиден #RRGGBB, иначе празно (пада на темата).
export function normalizeAccent(v) {
  const s = String(v || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : '';
}

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (r, g, b) =>
  `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;

// По-тъмен нюанс за градиента на заглавната лента (умножение по коефициент).
function darken(h, factor = 0.72) {
  const [r, g, b] = rgb(h);
  return hex(r * factor, g * factor, b * factor);
}

// По-светъл нюанс — смесване с бяло (t=0 → цвят, t=1 → бяло).
function tint(h, t) {
  const [r, g, b] = rgb(h);
  return hex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}

// CSS за нонсирания <style> блок, когато има собствен цвят —
// собственият цвят темизира ЦЯЛАТА визитка (не само шапката) чрез --t-* променливите.
export function accentCss(accent) {
  if (!accent) return '';
  return (
    `.vcard.custom-accent{` +
    `--t-a:${accent};` +
    `--t-b:${darken(accent)};` +
    `--t-accent:${accent};` +
    `--t-soft:${tint(accent, 0.9)};` +
    `--t-ring:${tint(accent, 0.62)};` +
    `}`
  );
}
