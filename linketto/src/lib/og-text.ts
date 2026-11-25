// Текст за OG картинките (чисти функции — тестват се). Шрифтът е Inter
// (латиница + кирилица + гръцки); за всичко друго next/og би теглил шрифт/
// емоджи от чужд CDN по време на заявката — затова такива знаци махаме.

const OG_SAFE =
  /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{M}\p{N}\p{Zs}.,:;!?'"„“”‘’«»()&@#%+\-–—/·…]/u;

export function ogSafeText(text: string): string {
  return Array.from(text)
    .filter((ch) => OG_SAFE.test(ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Съкращава до N знака (графеми по код-точки) с многоточие. */
export function clampText(text: string, max: number): string {
  const chars = Array.from(text.trim().replace(/\s+/g, ' '));
  return chars.length > max
    ? `${chars.slice(0, max - 1).join('').trimEnd()}…`
    : chars.join('');
}

/** Инициали за монограма („Мария Петрова“ → „МП“). */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
}

/** #rrggbb → rgba(r,g,b,a); невалиден вход → акцентът по подразбиране. */
export function hexToRgba(hex: string, alpha: number): string {
  const ok = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#3b82c4';
  const r = parseInt(ok.slice(1, 3), 16);
  const g = parseInt(ok.slice(3, 5), 16);
  const b = parseInt(ok.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
