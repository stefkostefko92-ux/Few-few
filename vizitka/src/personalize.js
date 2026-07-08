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

// По-тъмен нюанс за градиента на заглавната лента (умножение по коефициент).
function darken(hex, factor = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// CSS за нонсирания <style> блок, когато има собствен цвят.
export function accentCss(accent) {
  if (!accent) return '';
  return `.vcard-top.custom-accent{background:linear-gradient(135deg,${accent},${darken(accent)});}`;
}
