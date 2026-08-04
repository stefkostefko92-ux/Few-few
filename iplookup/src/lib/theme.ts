/**
 * Палитрата на Карбон IP — единственият източник на истината за цвят.
 *
 * Брандът е `mascot/tokens.json` („карбон + неонов лайм“): тъмната тема е
 * основната, светлата е равноправна алтернатива. Всички стойности минават през
 * `theme.test.ts`, който смята РЕАЛНИТЕ контрастни съотношения по WCAG 2.1 —
 * затова палитрата не може тихо да се влоши до нечетима.
 *
 * Част от брандовите цветове НЕ стават за текст на тъмен фон (`deep #0D4A02`,
 * `bottle #297F04`, `glow-lime #3C3F28`, `ink #0A0C0A`) — те са за повърхности и
 * ръбове. Не ги местѝ при текстовите токени; тестът ще падне.
 */

export interface ThemeTokens {
  /** Фон на страницата. */
  bg: string;
  /** Повърхност на карта. */
  surface: string;
  /** Повдигната повърхност (вложена карта, ред в таблица при посочване). */
  surfaceRaised: string;
  /** Ръб по подразбиране. */
  border: string;
  /** Ръб с по-силно присъствие (фокус, активна карта). */
  borderStrong: string;
  /** Основен текст. */
  text: string;
  /** Второстепенен текст — етикети на полета, описания. */
  textMuted: string;
  /** Най-слабият допустим текст — бележки под черта. Пак ≥ 4.5:1. */
  textFaint: string;
  /** Акцент: връзки, активни състояния, брандов подпис. */
  accent: string;
  /** По-светъл/по-наситен акцент за подсветка и графики. */
  accentStrong: string;
  /** Текст ВЪРХУ плътен акцентен фон (бутон). */
  onAccent: string;
  /** Състояния. Никога не носят смисъл САМО с цвят — винаги + икона и текст. */
  ok: string;
  warn: string;
  danger: string;
  info: string;
}

/** Тъмната тема е по подразбиране — тя е брандът. */
export const DARK: ThemeTokens = {
  bg: "#050706",
  surface: "#0C120B",
  surfaceRaised: "#141B12",
  border: "#26301F",
  // Брандовият `soft-olive` — единственият неутрал, който се вижда като ръб
  // върху почти черен фон (5.76:1) и пак не крещи.
  borderStrong: "#848D68",
  text: "#F4FAEA",
  textMuted: "#C8DDA6",
  textFaint: "#9DAC89",
  accent: "#5AB60D",
  accentStrong: "#99E72A",
  onAccent: "#050706",
  ok: "#5AB60D",
  warn: "#D9A521",
  danger: "#E8503A",
  info: "#7BC4E8",
};

/** Светлата тема — същият характер, обърнат: хартия с бутилково зелено. */
export const LIGHT: ThemeTokens = {
  bg: "#F7FAF2",
  surface: "#FFFFFF",
  surfaceRaised: "#F1F6E9",
  border: "#D5E1C4",
  borderStrong: "#5E6B4C",
  text: "#0A0C0A",
  textMuted: "#38452F",
  textFaint: "#55654A",
  accent: "#237003",
  accentStrong: "#0D4A02",
  onAccent: "#FFFFFF",
  // На светъл фон всеки червен и всеки зелен, минали AA, се събират около една
  // и съща светимост — тогава разликата остава САМО в тона, което е точно
  // случаят, който далтонизмът заличава. Затова „наред“ тук е брандовият `deep`:
  // сигналът се носи и от светлината, не само от цвета.
  ok: "#0D4A02",
  warn: "#7E5D08",
  danger: "#B7311F",
  info: "#155E77",
};

// ── Контраст по WCAG 2.1 ──────────────────────────────────────────────────

/** `#rrggbb` → трите канала 0–255. */
export function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match?.[1]) throw new Error(`невалиден HEX цвят: ${hex}`);
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Относителна светимост по WCAG 2.1 (не е същото като възприемана яркост). */
export function relativeLuminance(hex: string): number {
  const channels = parseHex(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

/** Контрастно съотношение между два цвята — от 1:1 (еднакви) до 21:1. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Праговете на WCAG 2.1 AA. */
export const AA = {
  /** Нормален текст. */
  text: 4.5,
  /** Едър текст (≥ 24px, или ≥ 18.66px получер). */
  largeText: 3,
  /** Графични обекти и части от интерфейса (ръбове, икони). */
  nonText: 3,
} as const;
