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
  { id: "waves", name: "Вълни" },
  { id: "hearts", name: "Сърца" },
  { id: "stars", name: "Звезди" },
  { id: "fireworks", name: "Фойерверк" },
  { id: "laurel", name: "Лаврови клонки" },
  { id: "texture", name: "Фина текстура" },
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
  /** Разредка (letter-spacing) в em: -0.03 … 0.3. */
  tracking?: number;
  /** Тегло на шрифта: 300 … 800. */
  weight?: number;
  /** Редова разредка (line-height): 1 … 2. */
  leading?: number;
  /** Наклонен (курсив) текст. */
  italic?: boolean;
  /** Градиентен фон на листа (вместо плътен). */
  bgGrad?: boolean;
  /** Втори цвят на градиента. */
  cbg2?: string;
  /** Ъгъл на градиента в градуси: 0 … 360. */
  bgAngle?: number;
  /** Глобален мащаб на текста върху листа: 0.8 … 1.3. */
  textScale?: number;
  /** Своя рамка на листа (вместо стандартната). */
  bord?: boolean;
  /** Стил на рамката. */
  bstyle?: "solid" | "dashed" | "dotted" | "double" | "none";
  /** Цвят на рамката. */
  bcolor?: string;
  /** Дебелина на рамката в mm: 0 … 8. */
  bwidth?: number;
  /** Заобляне на ъглите в mm: 0 … 20. */
  bradius?: number;
  /** Украса на фона. */
  decor?: string;
  /** Свой цвят на украсата (по подразбиране — акцентният). */
  decorColor?: string;
  /** Прозрачност на украсата (множител): 0.05 … 1. */
  decorOpacity?: number;
  /** Мащаб на украсата: 0.5 … 2. */
  decorScale?: number;
  /** Филтър на снимки/лога. */
  photoFilter?: "none" | "gray" | "sepia" | "duo";
  /** Градиентен текст на декоративните заглавия. */
  titleGradient?: boolean;
  /** Релефна сянка на заглавията. */
  titleShadow?: boolean;
  /** QR кодът в акцентния цвят (с проверка за скенируемост). */
  qrColor?: boolean;
  /** Мастило-пестелив режим — бял фон, за да не хаби мастило/тонер. */
  ecoMode?: boolean;
  /** Четим режим за дислексия (по-голяма разредка, тегло и редова разредка). */
  dyslexia?: boolean;
}

export const StyleSchemaShape = {
  themeId: z.string().max(20),
  cbg: z.string().max(20),
  cfg: z.string().max(20),
  cacc: z.string().max(20),
  customColors: z.boolean(),
  font: z.string().max(20),
  fonts: z.record(z.string().max(30), z.string().max(20)),
  tracking: z.number().min(-0.03).max(0.3),
  weight: z.number().int().min(300).max(800),
  leading: z.number().min(1).max(2),
  italic: z.boolean(),
  bgGrad: z.boolean(),
  cbg2: z.string().max(20),
  bgAngle: z.number().min(0).max(360),
  textScale: z.number().min(0.8).max(1.3),
  bord: z.boolean(),
  bstyle: z.enum(["solid", "dashed", "dotted", "double", "none"]),
  bcolor: z.string().max(20),
  bwidth: z.number().min(0).max(8),
  bradius: z.number().min(0).max(20),
  decor: z.string().max(20),
  decorColor: z.string().max(20),
  decorOpacity: z.number().min(0.05).max(1),
  decorScale: z.number().min(0.5).max(2),
  photoFilter: z.enum(["none", "gray", "sepia", "duo"]),
  titleGradient: z.boolean(),
  titleShadow: z.boolean(),
  qrColor: z.boolean(),
  ecoMode: z.boolean(),
  dyslexia: z.boolean(),
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

/**
 * CSS променливи за типографията — подават се на SheetPreview (style) и се
 * НАСЛЕДЯВАТ от цялото съдържание на листа. Затова разредка/тегло/редова
 * разредка/наклон важат за всичките 8 инструмента без промяна по студиата.
 * Печатната математика (mm) не се влияе — тук няма размери.
 */
export function fontVars(s: StyleState): React.CSSProperties {
  const v: React.CSSProperties = {};
  // Четим режим за дислексия — база от добри стойности; изричните избори на
  // потребителя (шрифт/разредка/тегло/редова разредка) я прегазват по-долу.
  if (s.dyslexia) {
    const css = "var(--font-nunito)"; // закръглен, четим безсерифен
    v.fontFamily = css;
    (v as Record<string, string>)["--font-display"] = css;
    v.letterSpacing = "0.05em";
    v.wordSpacing = "0.14em";
    v.lineHeight = 1.7;
    v.fontWeight = 500;
  }
  if (s.font) {
    const css = fontCss(s.font);
    v.fontFamily = css;
    (v as Record<string, string>)["--font-display"] = css;
  }
  if (typeof s.tracking === "number") v.letterSpacing = `${s.tracking}em`;
  if (typeof s.weight === "number") v.fontWeight = s.weight;
  if (typeof s.leading === "number") v.lineHeight = s.leading;
  if (s.italic) v.fontStyle = "italic";
  if (typeof s.textScale === "number") {
    (v as Record<string, string>)["--sheet-scale"] = String(s.textScale);
  }
  return v;
}

interface BorderFallback { width: number; style: string; color: string; radius: number }

/**
 * Числовите части на рамката (mm): стандартната (fallback) или изцяло по
 * избор. Всяко студио ги форматира със собствената си единица (mm или u()),
 * за да работи и в екранния преглед, и при печат.
 */
export function borderParts(s: StyleState, fb: BorderFallback): BorderFallback {
  const on = !!s.bord;
  return {
    style: on && s.bstyle ? s.bstyle : fb.style,
    width: on && typeof s.bwidth === "number" ? s.bwidth : fb.width,
    color: on && s.bcolor && hex.test(s.bcolor) ? s.bcolor : fb.color,
    radius: on && typeof s.bradius === "number" ? s.bradius : fb.radius,
  };
}

/**
 * Рамка, форматирана с дадена единица (mm за печат, u() за екранен преглед).
 * Печатната математика не се влияе — размерите се задават в mm числа.
 */
export function borderWith(
  s: StyleState,
  fb: BorderFallback,
  unit: (n: number) => string,
): { border: string; borderRadius: string } {
  const p = borderParts(s, fb);
  return {
    border: p.style === "none" ? "none" : `${unit(p.width)} ${p.style} ${p.color}`,
    borderRadius: unit(p.radius),
  };
}

/** Рамка в mm — за студиата, които рендират директно в mm. */
export function borderCss(s: StyleState, fb: BorderFallback): { border: string; borderRadius: string } {
  return borderWith(s, fb, (n) => `${n}mm`);
}

/**
 * Фон на листа: плътен (theme.bg) или мек градиент към втори цвят. Ползва се
 * навсякъде, където студиото рендира цветна повърхност на листа.
 */
export function sheetBg(s: StyleState, theme: WarmTheme): string {
  // Еко режим: чисто бял фон — най-малко мастило/тонер (има превес над всичко).
  if (s.ecoMode) return "#FFFFFF";
  if (s.bgGrad && s.cbg2 && hex.test(s.cbg2)) {
    const angle = typeof s.bgAngle === "number" ? s.bgAngle : 135;
    return `linear-gradient(${angle}deg, ${theme.bg}, ${s.cbg2})`;
  }
  return theme.bg;
}

/**
 * Груба оценка на мастилената покривност от цвета на фона (по-тъмен фон =
 * повече мастило). Връща етикет за потребителя — ориентир, не точна стойност.
 */
export function inkCoverage(s: StyleState, theme: WarmTheme): { label: string; heavy: boolean } {
  if (s.ecoMode) return { label: "ниска (еко)", heavy: false };
  const lum = relLuminance(s.customColors && s.cbg && hex.test(s.cbg) ? s.cbg : theme.bg);
  if (lum === null) return { label: "средна", heavy: false };
  if (lum < 0.35) return { label: "висока", heavy: true };
  if (lum < 0.7) return { label: "средна", heavy: false };
  return { label: "ниска", heavy: false };
}

/** Резолюция на украсата — свой цвят/прозрачност/мащаб с безопасни граници. */
export function resolveDecor(s: StyleState, accent: string) {
  return {
    color: s.decorColor && hex.test(s.decorColor) ? s.decorColor : accent,
    opacity: typeof s.decorOpacity === "number" ? s.decorOpacity : 1,
    scale: typeof s.decorScale === "number" ? s.decorScale : 1,
  };
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

/** CSS filter за снимки/лога (ч-б, сепия, дуотон) или undefined. */
export function photoFilterCss(s: StyleState): string | undefined {
  switch (s.photoFilter) {
    case "gray":
      return "grayscale(1)";
    case "sepia":
      return "sepia(0.6)";
    case "duo":
      return "grayscale(1) sepia(1) hue-rotate(175deg) saturate(1.3) brightness(0.95)";
    default:
      return undefined;
  }
}

/**
 * Ефекти за ДЕКОРАТИВНИ заглавия (едри) — градиентен текст и/или релефна сянка.
 * Ползва САМО акцент/втори цвят (никога theme.bg, който на места е текст-цвят).
 * Спреа се върху заглавния стил, затова прегазва color при градиент.
 */
export function titleFx(s: StyleState, theme: WarmTheme): React.CSSProperties {
  const fx: React.CSSProperties = {};
  if (s.titleGradient) {
    const c2 = s.cbg2 && hex.test(s.cbg2) ? s.cbg2 : theme.fg;
    fx.backgroundImage = `linear-gradient(90deg, ${theme.accent}, ${c2})`;
    fx.WebkitBackgroundClip = "text";
    fx.backgroundClip = "text";
    fx.color = "transparent";
    fx.WebkitTextFillColor = "transparent";
  }
  if (s.titleShadow) {
    fx.textShadow = "0 0.3mm 0 rgba(0,0,0,0.18)";
  }
  return fx;
}

/** Относителна осветеност (WCAG) на hex цвят, или null при невалиден. */
export function relLuminance(hexColor: string): number | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hexColor);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** Контрастно съотношение (WCAG) между два hex цвята, или null. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  if (la === null || lb === null) return null;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Степен по WCAG за нормален текст: AAA ≥7, AA ≥4.5, AA-голям ≥3, иначе слаб. */
export function contrastGrade(ratio: number): { label: string; ok: boolean } {
  if (ratio >= 7) return { label: "AAA", ok: true };
  if (ratio >= 4.5) return { label: "AA", ok: true };
  if (ratio >= 3) return { label: "AA (едър текст)", ok: true };
  return { label: "слаб", ok: false };
}

/**
 * Безопасен цвят за QR модулите: връща акцента само ако е достатъчно тъмен
 * спрямо бял фон (иначе чисто черно — скенируемостта е над естетиката).
 */
export function qrSafeColor(accent: string): string {
  const FALLBACK = "#1B1B1B";
  const lum = relLuminance(accent);
  if (lum === null) return FALLBACK;
  // Контраст спрямо бяло (L=1): (1+0.05)/(lum+0.05) ≥ 4 → достатъчно тъмен.
  return 1.05 / (lum + 0.05) >= 4 ? accent : FALLBACK;
}
