import type { Locale } from '@/i18n/config';

export type Source = { label: string; url: string };

export type RuleItem = {
  /** Котва в URL-а: `/rules#rdm`. Латиница, kebab-case, НЕ се променя после. */
  id: string;
  title: string;
  body: string;
  /** Кратък пример — разбира се по-бързо от определение. */
  example?: { good: string; bad: string };
  /**
   * `true` = практика на общността, не официално правило. Разликата е важна:
   * едното го налага платформата, другото — конкретният сървър.
   */
  community?: boolean;
};

export type RuleSection = {
  id: string;
  title: string;
  intro: string;
  sources: Source[];
  items: RuleItem[];
};

export type TutorialStep = { title: string; body: string };

export type Tutorial = {
  id: string;
  title: string;
  summary: string;
  steps: TutorialStep[];
};

export type ContentBundle = {
  rules: RuleSection[];
  tutorials: Tutorial[];
  keywords: string[];
};

export type LocalisedContent = Record<Locale, ContentBundle>;
