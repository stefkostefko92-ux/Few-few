// Шаблони по ниша — готов вид за 1 клик (фотограф, музикант, треньор,
// ресторант, магазин, автор). Само визуален пресет върху стиловия енджин:
// съдържанието (аватар, фонова снимка, бадж, броячи, медиа кит) се пази.

import {
  DEFAULT_STYLE,
  styleSchema,
  type ProfileStyle,
} from '@/lib/style';

export const TEMPLATE_IDS = [
  'photographer',
  'musician',
  'coach',
  'restaurant',
  'shop',
  'author',
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

type Template = { accent: string; style: Partial<ProfileStyle> };

export const NICHE_TEMPLATES: Record<TemplateId, Template> = {
  // Галерия: черно платно, серифен шрифт, тънки рамки, мрежа.
  photographer: {
    accent: '#e7e5e4',
    style: {
      bgStyle: 'solid',
      bgColor1: '#0a0a0a',
      textColor: '#f5f5f4',
      font: 'serif',
      buttonShape: 'square',
      buttonFill: 'outline',
      layout: 'grid',
    },
  },
  // Сцена: виолетов градиент + звездно небе, плътни бутони.
  musician: {
    accent: '#a855f7',
    style: {
      bgStyle: 'gradient',
      bgColor1: '#2e1065',
      bgColor2: '#020617',
      bgEffect: 'stars',
      buttonShape: 'pill',
      buttonFill: 'solid',
      buttonShadow: 'soft',
    },
  },
  // Енергия: зелен дишащ градиент, заоблен шрифт, твърда сянка.
  coach: {
    accent: '#22c55e',
    style: {
      bgStyle: 'gradient',
      bgColor1: '#052e16',
      bgColor2: '#020617',
      bgEffect: 'gradient',
      font: 'rounded',
      buttonShape: 'rounded',
      buttonFill: 'solid',
      buttonShadow: 'hard',
    },
  },
  // Топло меню: кремав фон, серифен шрифт, теракота.
  restaurant: {
    accent: '#c2410c',
    style: {
      bgStyle: 'solid',
      bgColor1: '#fff7ed',
      textColor: '#431407',
      font: 'serif',
      buttonShape: 'rounded',
      buttonFill: 'soft',
    },
  },
  // Витрина: бяло и графит, ясни плътни бутони.
  shop: {
    accent: '#0f172a',
    style: {
      bgStyle: 'solid',
      bgColor1: '#ffffff',
      textColor: '#0f172a',
      buttonShape: 'pill',
      buttonFill: 'solid',
      buttonShadow: 'soft',
    },
  },
  // Книжна страница: хартиен фон, серифен шрифт, подравнено вляво.
  author: {
    accent: '#7c2d12',
    style: {
      bgStyle: 'solid',
      bgColor1: '#f8f5ef',
      textColor: '#1c1917',
      font: 'serif',
      buttonShape: 'square',
      buttonFill: 'outline',
      align: 'start',
    },
  },
};

export function isTemplateId(value: string): value is TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(value);
}

/** Прилага шаблона: визуалните полета от нулата, съдържанието се пази. */
export function applyTemplate(
  current: ProfileStyle,
  id: TemplateId,
): ProfileStyle {
  return styleSchema.parse({
    ...DEFAULT_STYLE,
    avatarUrl: current.avatarUrl,
    avatarShape: current.avatarShape,
    bgImageUrl: current.bgImageUrl,
    hideBadge: current.hideBadge,
    showViews: current.showViews,
    mediaKit: current.mediaKit,
    ...NICHE_TEMPLATES[id].style,
  });
}
