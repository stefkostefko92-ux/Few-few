import type { BrandPlan, CrossPostPlatform } from './plan.js';

export interface BrandBrief {
  name: string;
  summary: string;
  voice: string;
  language: string;
  websiteUrl?: string | null;
}

/** Какво е работило до момента — само числа от Instagram Insights, не мнения. */
export interface PerformanceContext {
  /** Най-силните публикувани постове (по ангажираност спрямо обхвата). */
  top: Array<{ caption: string; kind: 'IMAGE' | 'REELS'; reach: number; interactions: number }>;
  /** Най-слабите — за да не се повтарят същите ъгли. */
  weak: Array<{ caption: string; kind: 'IMAGE' | 'REELS'; reach: number; interactions: number }>;
  /** Кой формат носи повече обхват средно, ако има данни. */
  bestKind: 'IMAGE' | 'REELS' | null;
}

export interface PromptInput {
  brand: BrandBrief;
  kind: 'IMAGE' | 'REELS';
  topic: string;
  count: number;
  mediaDescription?: string;
  plan?: BrandPlan | null;
  performance?: PerformanceContext | null;
  crossPost?: readonly CrossPostPlatform[];
}

const PLATFORM_HINT: Record<CrossPostPlatform, string> = {
  facebook:
    'Facebook: по-дълъг, разговорен, линкът е кликаем — може да го включиш; без хаштаг-салата.',
  tiktok: 'TikTok: кратък, в първо лице, 2-3 хаштага, езикът на платформата (тренд-кукичка).',
  linkedin: 'LinkedIn: професионален, полза/урок в първия ред, без хаштаг-салата, до 3 хаштага.',
  x: 'X: до 280 знака, една мисъл, без хаштагове или най-много един.',
};

function trim(text: string, max = 160): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/**
 * Съставя потребителския промпт. Системният блок е байт-стабилен (кеш), затова всичко
 * променливо — план, представяне, платформи — влиза тук, в стабилен ред.
 */
export function buildUserPrompt(input: PromptInput): string {
  const lines: Array<string | null> = [
    `Бранд: ${input.brand.name}`,
    `Какво е: ${input.brand.summary}`,
    `Тон на глас: ${input.brand.voice}`,
    `Език на текста: ${input.brand.language}`,
    input.brand.websiteUrl ? `Сайт: ${input.brand.websiteUrl}` : null,
    `Формат: ${input.kind === 'REELS' ? 'Reel (вертикално видео)' : 'снимка в емисията'}`,
    input.mediaDescription ? `Материалът показва: ${input.mediaDescription}` : null,
    `Тема: ${input.topic}`,
  ];

  const plan = input.plan;
  if (plan) {
    lines.push('', 'План за поддръжка на страницата:');
    if (plan.goals) lines.push(`- Цели: ${plan.goals}`);
    if (plan.pillars.length) lines.push(`- Тематични стълбове: ${plan.pillars.join(' · ')}`);
    if (plan.keywords.length) {
      lines.push(
        `- Ключови думи за откриваемост (вплети ги естествено в caption-а): ${plan.keywords.join(', ')}`,
      );
    }
    if (plan.hashtagSets.length) {
      lines.push(
        `- Хаштаг набори на бранда (избери от тях, не измисляй нови): ${plan.hashtagSets
          .map((set) => set.join(' '))
          .join(' | ')}`,
      );
    }
    if (plan.cta) lines.push(`- Призив за действие: ${plan.cta}`);
    if (plan.avoid) lines.push(`- Забранено: ${plan.avoid}`);
  }

  const perf = input.performance;
  if (perf && (perf.top.length || perf.weak.length)) {
    lines.push('', 'Данни от Instagram Insights за тази страница (истински числа):');
    if (perf.bestKind) {
      lines.push(
        `- Форматът с повече обхват досега: ${perf.bestKind === 'REELS' ? 'Reels' : 'снимки'}.`,
      );
    }
    for (const post of perf.top) {
      lines.push(
        `- Силен (${post.kind}, обхват ${post.reach}, взаимодействия ${post.interactions}): „${trim(post.caption)}“`,
      );
    }
    for (const post of perf.weak) {
      lines.push(
        `- Слаб (${post.kind}, обхват ${post.reach}, взаимодействия ${post.interactions}): „${trim(post.caption)}“`,
      );
    }
    lines.push(
      '- Учи се от силните ъгли (структура на кукичката, дължина, тема), не ги преписвай; избягвай ъглите на слабите.',
    );
  }

  const platforms = input.crossPost ?? [];
  if (platforms.length) {
    lines.push('', 'За всяка чернова дай и адаптиран вариант на текста за:');
    for (const platform of platforms) lines.push(`- ${PLATFORM_HINT[platform]}`);
  } else {
    lines.push('', 'Не давай варианти за други платформи (variants: празен списък).');
  }

  lines.push('', `Дай точно ${input.count} различни чернови — различни ъгли, не преформулировки.`);
  return lines.filter((line): line is string => line !== null).join('\n');
}
