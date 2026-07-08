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
  // Безсерифни
  { id: "manrope", name: "Манроуп", css: "var(--font-sans)", cat: "Безсерифни" },
  { id: "montserrat", name: "Монсерат", css: "var(--font-montserrat)", cat: "Безсерифни" },
  { id: "roboto", name: "Робото", css: "var(--font-roboto)", cat: "Безсерифни" },
  { id: "opensans", name: "Оупън Санс", css: "var(--font-opensans)", cat: "Безсерифни" },
  { id: "inter", name: "Интер", css: "var(--font-inter)", cat: "Безсерифни" },
  { id: "raleway", name: "Ралуей", css: "var(--font-raleway)", cat: "Безсерифни" },
  { id: "mulish", name: "Мълиш", css: "var(--font-mulish)", cat: "Безсерифни" },
  { id: "nunito", name: "Нунито (закръглен)", css: "var(--font-nunito)", cat: "Безсерифни" },
  { id: "nunitosans", name: "Нунито Санс", css: "var(--font-nunitosans)", cat: "Безсерифни" },
  { id: "rubik", name: "Рубик", css: "var(--font-rubik)", cat: "Безсерифни" },
  { id: "firasans", name: "Фира Санс", css: "var(--font-firasans)", cat: "Безсерифни" },
  { id: "ptsans", name: "PT Санс", css: "var(--font-ptsans)", cat: "Безсерифни" },
  { id: "ubuntu", name: "Убунту", css: "var(--font-ubuntu)", cat: "Безсерифни" },
  { id: "oswald", name: "Осуалд (тесен)", css: "var(--font-oswald)", cat: "Безсерифни" },
  { id: "comfortaa", name: "Комфортаа (мек)", css: "var(--font-comfortaa)", cat: "Безсерифни" },
  { id: "exo2", name: "Ексо 2", css: "var(--font-exo2)", cat: "Безсерифни" },
  { id: "play", name: "Плей", css: "var(--font-play)", cat: "Безсерифни" },
  { id: "golos", name: "Голос", css: "var(--font-golos)", cat: "Безсерифни" },
  { id: "onest", name: "Онест", css: "var(--font-onest)", cat: "Безсерифни" },
  { id: "unbounded", name: "Ънбаундед", css: "var(--font-unbounded)", cat: "Безсерифни" },
  { id: "commissioner", name: "Комисионер", css: "var(--font-commissioner)", cat: "Безсерифни" },
  { id: "cuprum", name: "Купрум", css: "var(--font-cuprum)", cat: "Безсерифни" },
  { id: "ruda", name: "Руда", css: "var(--font-ruda)", cat: "Безсерифни" },
  // Серифни
  { id: "playfair", name: "Плейфеър", css: "var(--font-display)", cat: "Серифни" },
  { id: "lora", name: "Лора", css: "var(--font-lora)", cat: "Серифни" },
  { id: "ptserif", name: "PT Сериф", css: "var(--font-ptserif)", cat: "Серифни" },
  { id: "merriweather", name: "Мериведър", css: "var(--font-merriweather)", cat: "Серифни" },
  { id: "cormorant", name: "Корморант", css: "var(--font-cormorant)", cat: "Серифни" },
  { id: "alegreya", name: "Алегрея", css: "var(--font-alegreya)", cat: "Серифни" },
  { id: "vollkorn", name: "Фолкорн", css: "var(--font-vollkorn)", cat: "Серифни" },
  { id: "bitter", name: "Битер", css: "var(--font-bitter)", cat: "Серифни" },
  { id: "oldstandard", name: "Олд Стандарт", css: "var(--font-oldstandard)", cat: "Серифни" },
  { id: "literata", name: "Литерата", css: "var(--font-literata)", cat: "Серифни" },
  { id: "notoserif", name: "Ното Сериф", css: "var(--font-notoserif)", cat: "Серифни" },
  { id: "spectral", name: "Спектрал", css: "var(--font-spectral)", cat: "Серифни" },
  { id: "podkova", name: "Подкова", css: "var(--font-podkova)", cat: "Серифни" },
  // Ефектни
  { id: "prata", name: "Прата (елегантен)", css: "var(--font-prata)", cat: "Ефектни" },
  { id: "yeseva", name: "Есева", css: "var(--font-yeseva)", cat: "Ефектни" },
  { id: "russo", name: "Русо (плътен)", css: "var(--font-russo)", cat: "Ефектни" },
  { id: "philosopher", name: "Философър", css: "var(--font-philosopher)", cat: "Ефектни" },
  { id: "marmelad", name: "Мармелад", css: "var(--font-marmelad)", cat: "Ефектни" },
  { id: "rubikmono", name: "Рубик Моно", css: "var(--font-rubikmono)", cat: "Ефектни" },
  { id: "stalinist", name: "Сталинист", css: "var(--font-stalinist)", cat: "Ефектни" },
  { id: "tenor", name: "Тенор Санс", css: "var(--font-tenor)", cat: "Ефектни" },
  { id: "underdog", name: "Ъндърдог", css: "var(--font-underdog)", cat: "Ефектни" },
  { id: "seymour", name: "Сеймур", css: "var(--font-seymour)", cat: "Ефектни" },
  // Ръкописни
  { id: "pacifico", name: "Пасифико", css: "var(--font-pacifico)", cat: "Ръкописни" },
  { id: "caveat", name: "Кавеат", css: "var(--font-caveat)", cat: "Ръкописни" },
  { id: "marck", name: "Марк Скрипт", css: "var(--font-marck)", cat: "Ръкописни" },
  { id: "badscript", name: "Бад Скрипт", css: "var(--font-badscript)", cat: "Ръкописни" },
  { id: "pangolin", name: "Панголин", css: "var(--font-pangolin)", cat: "Ръкописни" },
  { id: "neucha", name: "Неуча", css: "var(--font-neucha)", cat: "Ръкописни" },
  { id: "lobster", name: "Лобстер", css: "var(--font-lobster)", cat: "Ръкописни" },
  // Равноширок
  { id: "jetbrains", name: "JetBrains Mono", css: "var(--font-jetbrains)", cat: "Равноширок" },
  { id: "robotomono", name: "Робото Моно", css: "var(--font-robotomono)", cat: "Равноширок" },
  { id: "ibmplex", name: "IBM Plex Mono", css: "var(--font-ibmplex)", cat: "Равноширок" },
  { id: "sourcecode", name: "Сорс Код", css: "var(--font-sourcecode)", cat: "Равноширок" },
  { id: "anonymous", name: "Анонимъс Про", css: "var(--font-anonymous)", cat: "Равноширок" },
  { id: "ptmono", name: "PT Моно", css: "var(--font-ptmono)", cat: "Равноширок" },
  { id: "ubuntumono", name: "Убунту Моно", css: "var(--font-ubuntumono)", cat: "Равноширок" },
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
