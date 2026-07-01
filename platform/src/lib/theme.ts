// Тема на публикувания сайт: основен цвят + шрифт. Чисти помощници (тестваеми),
// стойностите се прилагат като CSS променливи на обвивката на публичния сайт.

export type FontKey = "sans" | "serif" | "rounded";

export const FONT_STACKS: Record<FontKey, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", "Noto Serif", serif',
  rounded: '"Trebuchet MS", "Segoe UI", ui-rounded, system-ui, sans-serif',
};

export const FONT_LABEL: Record<FontKey, string> = {
  sans: "Модерен (sans)",
  serif: "Класически (serif)",
  rounded: "Мек (rounded)",
};

export const DEFAULT_ACCENT = "#4f46e5"; // индиго (по подразбиране)

const HEX = /^#[0-9a-fA-F]{6}$/;

// Валидира и нормализира hex цвят; при невалиден връща подразбирания.
export function safeAccent(color: string | null | undefined): string {
  return color && HEX.test(color) ? color.toLowerCase() : DEFAULT_ACCENT;
}

export function safeFont(font: string | null | undefined): FontKey {
  return font === "serif" || font === "rounded" ? font : "sans";
}

// По-тъмен вариант на цвета (за hover/градиент) — умножава по фактор < 1.
export function darken(hex: string, factor = 0.82): string {
  const c = safeAccent(hex).slice(1);
  const n = parseInt(c, 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Дали текстът върху този цвят да е бял или тъмен (по относителна яркост).
export function contrastText(hex: string): "#ffffff" | "#0f172a" {
  const c = safeAccent(hex).slice(1);
  const n = parseInt(c, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Относителна яркост (YIQ) — праг 150.
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#0f172a" : "#ffffff";
}

// CSS променливи за обвивката на публичния сайт.
export function themeVars(
  brandColor: string | null | undefined,
  fontFamily: string | null | undefined,
): Record<string, string> {
  const accent = safeAccent(brandColor);
  return {
    "--pub-accent": accent,
    "--pub-accent-dark": darken(accent),
    "--pub-accent-text": contrastText(accent),
    "--pub-font": FONT_STACKS[safeFont(fontFamily)],
  };
}
