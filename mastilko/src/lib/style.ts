import { z } from "zod";
import { themeById, type WarmTheme } from "@/lib/themes";

// Споделен слой за персонализация — ползва се от ВСИЧКИ инструменти:
// много шрифтове, шрифт на всеки елемент/ред, свои цветове и украса на фона.

export interface FontDef {
  id: string;
  name: string;
  css: string;
  cat: "Безсерифни" | "Серифни" | "Ефектни" | "Ръкописни" | "Равноширок";
}

export const FONTS: FontDef[] = [
  { id: "manrope", name: "Манроуп", css: "var(--font-sans)", cat: "Безсерифни" },
  { id: "montserrat", name: "Монсерат", css: "var(--font-montserrat)", cat: "Безсерифни" },
  { id: "nunito", name: "Нунито (закръглен)", css: "var(--font-nunito)", cat: "Безсерифни" },
  { id: "rubik", name: "Рубик", css: "var(--font-rubik)", cat: "Безсерифни" },
  { id: "oswald", name: "Осуалд (тесен)", css: "var(--font-oswald)", cat: "Безсерифни" },
  { id: "comfortaa", name: "Комфортаа (мек)", css: "var(--font-comfortaa)", cat: "Безсерифни" },
  { id: "playfair", name: "Плейфеър", css: "var(--font-display)", cat: "Серифни" },
  { id: "lora", name: "Лора", css: "var(--font-lora)", cat: "Серифни" },
  { id: "ptserif", name: "PT Сериф", css: "var(--font-ptserif)", cat: "Серифни" },
  { id: "merriweather", name: "Мериведър", css: "var(--font-merriweather)", cat: "Серифни" },
  { id: "prata", name: "Прата (елегантен)", css: "var(--font-prata)", cat: "Ефектни" },
  { id: "yeseva", name: "Есева", css: "var(--font-yeseva)", cat: "Ефектни" },
  { id: "russo", name: "Русо (плътен)", css: "var(--font-russo)", cat: "Ефектни" },
  { id: "pacifico", name: "Пасифико", css: "var(--font-pacifico)", cat: "Ръкописни" },
  { id: "marck", name: "Марк Скрипт", css: "var(--font-marck)", cat: "Ръкописни" },
  { id: "caveat", name: "Кавеат", css: "var(--font-caveat)", cat: "Ръкописни" },
  { id: "jetbrains", name: "JetBrains (равноширок)", css: "var(--font-jetbrains)", cat: "Равноширок" },
];

export function fontCss(id: string | undefined): string {
  return FONTS.find((f) => f.id === id)?.css ?? "var(--font-sans)";
}

// Украса на фона — CSS фонове (ползват акцентния цвят). Прилагат се под
// съдържанието на листа.
export const DECORS: Array<{ id: string; name: string }> = [
  { id: "none", name: "Без украса" },
  { id: "dots", name: "Точки" },
  { id: "grid", name: "Мрежа" },
  { id: "diagonal", name: "Диагонални линии" },
  { id: "stripes", name: "Ивици" },
  { id: "confetti", name: "Конфети" },
  { id: "corners", name: "Ъглови орнаменти" },
  { id: "frame", name: "Двойна рамка" },
  { id: "gradient", name: "Меко сияние" },
];

export interface StyleState {
  themeId: string;
  cbg?: string;
  cfg?: string;
  cacc?: string;
  customColors?: boolean;
  /** Глобален шрифт (по подразбиране). */
  font?: string;
  /** Шрифт за конкретен елемент/ред: ключ → font id. */
  fonts?: Record<string, string>;
  /** Украса на фона. */
  decor?: string;
}

export const StyleSchemaShape = {
  themeId: z.string().max(20),
  cbg: z.string().max(20),
  cfg: z.string().max(20),
  cacc: z.string().max(20),
  customColors: z.boolean(),
  font: z.string().max(20),
  fonts: z.record(z.string().max(30), z.string().max(20)),
  decor: z.string().max(20),
};

const hex = /^#[0-9a-fA-F]{3,8}$/;

export function resolveTheme(s: StyleState): WarmTheme {
  const base = themeById(s.themeId);
  if (!s.customColors) return base;
  return {
    ...base,
    bg: s.cbg && hex.test(s.cbg) ? s.cbg : base.bg,
    fg: s.cfg && hex.test(s.cfg) ? s.cfg : base.fg,
    accent: s.cacc && hex.test(s.cacc) ? s.cacc : base.accent,
  };
}

/** CSS променливи за глобалния шрифт — подават се на SheetPreview (style). */
export function fontVars(s: StyleState): React.CSSProperties {
  if (!s.font) return {};
  const css = fontCss(s.font);
  return { fontFamily: css, ["--font-display" as string]: css };
}

/**
 * Шрифтът за конкретен елемент/ред: собствен избор → глобален → естествен
 * подразбиращ се (напр. заглавен серифен). Така всеки ред може да е различен.
 */
export function elementFont(s: StyleState, key: string, fallback?: string): string {
  const perEl = s.fonts?.[key];
  if (perEl) return fontCss(perEl);
  if (s.font) return fontCss(s.font);
  return fallback ?? "var(--font-sans)";
}
