// Стилов енджин на публичния профил — „персонализация до крайна степен“.
// Всичко живее в Profile.style (Json) и се валидира тук със zod, така че
// нови опции се добавят без миграции. Страниците само прилагат резултата.

import { z } from 'zod';
import type { CSSProperties } from 'react';
import { contrastHex, parseHex } from '@/lib/contrast';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
// Картинка: външен https URL или качен от нас файл (/media/...).
const imageRef = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) =>
      /^\/media\/[a-z0-9-]+\.webp$/.test(value) ||
      (value.startsWith('https://') && z.string().url().safeParse(value).success),
  );

export const styleSchema = z.object({
  bgStyle: z.enum(['theme', 'solid', 'gradient', 'image']).default('theme'),
  // Жива сцена върху фона: aurora петна, звездно небе или дишащ градиент.
  bgEffect: z.enum(['none', 'aurora', 'stars', 'gradient']).default('none'),
  bgColor1: hex.default('#1e1b4b'),
  bgColor2: hex.default('#020617'),
  bgImageUrl: imageRef.optional(),
  textColor: hex.optional(),
  // Затъмняване върху фонова снимка (0–0.8) — пази текста четим.
  bgOverlay: z.coerce.number().min(0).max(0.8).default(0.35),
  font: z.enum(['sans', 'serif', 'mono', 'rounded']).default('sans'),
  buttonShape: z.enum(['pill', 'rounded', 'square']).default('pill'),
  buttonFill: z.enum(['soft', 'solid', 'outline']).default('soft'),
  buttonShadow: z.enum(['none', 'soft', 'hard']).default('none'),
  layout: z.enum(['list', 'grid']).default('list'),
  align: z.enum(['center', 'start']).default('center'),
  avatarUrl: imageRef.optional(),
  avatarShape: z.enum(['circle', 'rounded', 'square']).default('circle'),
  // Скриване на Linketto баджа — само платени планове (пази се в action-а).
  hideBadge: z.boolean().default(false),
  // Бадж „N посещения този месец“ — социално доказателство без бисквитки.
  showViews: z.boolean().default(false),
  // Публичен медиа кит (/u/<slug>/media-kit) — за оферти към брандове.
  // Показва аудиторията по език/държава (нашето уникално предимство).
  mediaKit: z.boolean().default(false),
});

export type ProfileStyle = z.infer<typeof styleSchema>;

/** Текстовите полета на формата „Персонализация“ (без чекбоксовете). */
export const STYLE_TEXT_FIELDS = [
  'bgStyle',
  'bgEffect',
  'bgColor1',
  'bgColor2',
  'bgImageUrl',
  'textColor',
  'font',
  'buttonShape',
  'buttonFill',
  'buttonShadow',
  'layout',
  'align',
  'avatarUrl',
  'avatarShape',
  'bgOverlay',
] as const;
export const STYLE_FLAG_FIELDS = ['hideBadge', 'showViews', 'mediaKit'] as const;

/**
 * Суровият вход за styleSchema от полетата на формата — общ за записа
 * (updateStyleAction) и за живия преглед. Празно поле = подразбиране;
 * чекбокс = 'on'.
 */
export function styleInput(get: (name: string) => unknown): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const name of STYLE_TEXT_FIELDS) {
    const value = String(get(name) ?? '').trim();
    raw[name] = value === '' ? undefined : value;
  }
  for (const name of STYLE_FLAG_FIELDS) raw[name] = get(name) === 'on';
  return raw;
}

export const DEFAULT_STYLE: ProfileStyle = styleSchema.parse({});

/** Прощаващ парсер: невалидно/липсващо поле пада към подразбирането. */
export function parseStyle(raw: unknown): ProfileStyle {
  const result = styleSchema.safeParse(raw ?? {});
  if (result.success) return result.data;
  if (raw && typeof raw === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      const single = styleSchema.safeParse({ [key]: value });
      if (single.success) cleaned[key] = value;
    }
    const retry = styleSchema.safeParse(cleaned);
    if (retry.success) return retry.data;
  }
  return DEFAULT_STYLE;
}

// Самостоятелно хоствани през next/font (виж src/app/fonts.ts).
const FONT_STACKS: Record<ProfileStyle['font'], string> = {
  sans: 'var(--font-profile-sans), ui-sans-serif, system-ui, sans-serif',
  serif: 'var(--font-profile-serif), ui-serif, Georgia, serif',
  mono: 'var(--font-profile-mono), ui-monospace, Menlo, monospace',
  rounded: 'var(--font-profile-rounded), ui-rounded, ui-sans-serif, sans-serif',
};

export function fontFamily(style: ProfileStyle): string {
  return FONT_STACKS[style.font];
}

/** Inline CSS за фона според избрания режим (theme режимът остава на класове). */
export function backgroundCss(
  style: ProfileStyle,
): CSSProperties | undefined {
  switch (style.bgStyle) {
    case 'solid':
      return { backgroundColor: style.bgColor1 };
    case 'gradient':
      return {
        backgroundImage: `linear-gradient(to bottom, ${style.bgColor1}, ${style.bgColor2})`,
      };
    case 'image':
      return style.bgImageUrl
        ? {
            backgroundImage: `linear-gradient(rgba(2,6,23,${style.bgOverlay}), rgba(2,6,23,${style.bgOverlay})), url("${encodeURI(style.bgImageUrl)}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }
        : { backgroundColor: style.bgColor1 };
    default:
      return undefined;
  }
}

export function buttonShapeClass(style: ProfileStyle): string {
  switch (style.buttonShape) {
    case 'rounded':
      return 'rounded-2xl';
    case 'square':
      return 'rounded-none';
    default:
      return 'rounded-full';
  }
}

export function buttonShadowClass(style: ProfileStyle): string {
  switch (style.buttonShadow) {
    case 'soft':
      return 'shadow-md';
    case 'hard':
      return 'shadow-[4px_4px_0_rgba(0,0,0,0.35)]';
    default:
      return '';
  }
}

/** Кой цвят текст се чете върху даден hex фон — този с по-висок WCAG
 *  контраст (не праг по яркост: среден син върху бял пада под 4.5:1). */
export function readableOn(hexColor: string): string {
  if (!parseHex(hexColor)) return '#ffffff';
  const dark = contrastHex('#111827', hexColor);
  const light = contrastHex('#ffffff', hexColor);
  const best = dark >= light ? '#111827' : '#ffffff';
  // Среден тон: нито графитът, нито бялото стигат 4.5:1 → чисто черно.
  if (Math.max(dark, light) < 4.5 && contrastHex('#000000', hexColor) >= 4.5) {
    return '#000000';
  }
  return best;
}

/** Inline CSS на бутон според fill режима и (пер-блок) акцентен цвят. */
export function buttonCss(
  style: ProfileStyle,
  accent: string,
): CSSProperties {
  switch (style.buttonFill) {
    case 'solid':
      return {
        backgroundColor: accent,
        borderColor: accent,
        color: readableOn(accent),
      };
    case 'outline':
      return { borderColor: accent, backgroundColor: 'transparent' };
    default:
      return { borderColor: accent, backgroundColor: `${accent}22` };
  }
}
