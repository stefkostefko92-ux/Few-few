import type { Locale } from '@/i18n/config';

import { contentBg } from './bg';
import { contentEn } from './en';
import type { ContentBundle } from './types';

const CONTENT: Record<Locale, ContentBundle> = { bg: contentBg, en: contentEn };

export function getContent(locale: Locale): ContentBundle {
  return CONTENT[locale];
}

export type { ContentBundle, RuleItem, RuleSection, Tutorial } from './types';
