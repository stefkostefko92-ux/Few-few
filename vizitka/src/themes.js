// Цветови теми на публичната визитка (CSS клас theme-<id> в styles.css).
export const THEMES = [
  { id: 'blue', label: 'Синьо-виолетова (класика)' },
  { id: 'emerald', label: 'Смарагдова' },
  { id: 'sunset', label: 'Залез (оранжево-розова)' },
  { id: 'ocean', label: 'Океанска' },
  { id: 'graphite', label: 'Графитена' },
  { id: 'rose', label: 'Бордо' },
];

const IDS = new Set(THEMES.map((t) => t.id));

export function normalizeTheme(id) {
  return IDS.has(id) ? id : 'blue';
}
