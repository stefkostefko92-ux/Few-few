// Стилов енджин на публичния профил — „персонализация до крайна степен“.
// Всичко живее в Profile.style (Json) и се валидира тук със zod, така че
// нови опции се добавят без миграции. Страниците само прилагат резултата.

import { z } from 'zod';
import type { CSSProperties } from 'react';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => value.startsWith('https://'));

export const styleSchema = z.object({
  bgStyle: z.enum(['theme', 'solid', 'gradient', 'image']).default('theme'),
  bgColor1: hex.default('#1e1b4b'),
  bgColor2: hex.default('#020617'),
  bgImageUrl: httpsUrl.optional(),
  textColor: hex.optional(),
  font: z.enum(['sans', 'serif', 'mono', 'rounded']).default('sans'),
  buttonShape: z.enum(['pill', 'rounded', 'square']).default('pill'),
  buttonFill: z.enum(['soft', 'solid', 'outline']).default('soft'),
  buttonShadow: z.enum(['none', 'soft', 'hard']).default('none'),
  layout: z.enum(['list', 'grid']).default('list'),
  align: z.enum(['center', 'start']).default('center'),
  avatarUrl: httpsUrl.optional(),
  avatarShape: z.enum(['circle', 'rounded', 'square']).default('circle'),
  // Скриване на Linketto баджа — само платени планове (пази се в action-а).
  hideBadge: z.boolean().default(false),
});

export type ProfileStyle = z.infer<typeof styleSchema>;

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

const FONT_STACKS: Record<ProfileStyle['font'], string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "JetBrains Mono", Menlo, monospace',
  rounded: 'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, ui-sans-serif, sans-serif',
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
            backgroundImage: `url("${encodeURI(style.bgImageUrl)}")`,
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

/** Кой цвят текст се чете върху даден hex фон. */
export function readableOn(hexColor: string): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? '#111827' : '#ffffff';
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
