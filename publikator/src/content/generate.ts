import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
// Помощникът на SDK-то очаква схеми от новото ядро на zod (`zod/v4`, налично в zod 3.25+).
// Останалата част от продукта ползва класическия `zod` API — не ги смесвай в един файл.
import * as z from 'zod/v4';
import { CAPTION_MAX, HASHTAG_RECOMMENDED } from './lint.js';

/** Постоянният системен блок — държим го байт-стабилен заради prompt caching. */
const SYSTEM_PROMPT = `Ти си Social Media Manager за Instagram със заявка за максимален обхват.
Правила, по които пишеш:
- Кукичката е в първия ред на caption-а — тя решава дали някой ще отвори „още“.
- Пишеш за откриваемост: ключовите думи вървят в caption-а, не само в хаштаговете.
- 3-5 нишови хаштага, не списък. Максимум ${HASHTAG_RECOMMENDED}.
- Caption под ${CAPTION_MAX} знака, без линкове (в Instagram те не са кликаеми).
- Alt текстът описва какво реално се вижда — за екранни четци и за търсене.
- Пишеш на езика на бранда, без емоджи-салата и без кухи суперлативи.
- Не измисляш факти, цени, обещания или отзиви за бранда.`;

const draftSchema = z.object({
  hook: z.string().describe('Първият ред на caption-а — самостоятелна кукичка.'),
  caption: z.string().describe('Пълният caption, включително кукичката, без хаштагове.'),
  hashtags: z.array(z.string()).describe('Нишови хаштагове с водещ #.'),
  alt_text: z.string().describe('Описание на визуалния материал.'),
  rationale: z.string().describe('Едно изречение защо тази чернова печели обхват.'),
});

const draftsSchema = z.object({ drafts: z.array(draftSchema) });

export interface BrandBrief {
  name: string;
  summary: string;
  voice: string;
  language: string;
  websiteUrl?: string | null;
}

export interface GenerateInput {
  brand: BrandBrief;
  kind: 'IMAGE' | 'REELS';
  topic: string;
  count: number;
  mediaDescription?: string;
}

export interface GeneratedDraft {
  hook: string;
  caption: string;
  hashtags: string[];
  altText: string;
  rationale: string;
}

export class ContentGenerationError extends Error {}

export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

/**
 * Връща чернови — НЕ публикува. Одобрението е човешко решение по-надолу по пътя.
 */
export async function generateDrafts(
  client: Anthropic,
  input: GenerateInput,
): Promise<GeneratedDraft[]> {
  const userPrompt = [
    `Бранд: ${input.brand.name}`,
    `Какво е: ${input.brand.summary}`,
    `Тон на глас: ${input.brand.voice}`,
    `Език на текста: ${input.brand.language}`,
    input.brand.websiteUrl ? `Сайт: ${input.brand.websiteUrl}` : null,
    `Формат: ${input.kind === 'REELS' ? 'Reel (вертикално видео)' : 'снимка в емисията'}`,
    input.mediaDescription ? `Материалът показва: ${input.mediaDescription}` : null,
    `Тема: ${input.topic}`,
    `Дай точно ${input.count} различни чернови — различни ъгли, не преформулировки.`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 8000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(draftsSchema), effort: 'medium' },
    messages: [{ role: 'user', content: userPrompt }],
  });

  if (response.stop_reason === 'refusal') {
    throw new ContentGenerationError('Моделът отказа да произведе съдържание за тази заявка.');
  }

  const parsed = response.parsed_output;
  if (!parsed || parsed.drafts.length === 0) {
    throw new ContentGenerationError('Моделът не върна валидни чернови.');
  }

  return parsed.drafts.map((draft) => ({
    hook: draft.hook,
    caption: draft.caption,
    hashtags: draft.hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)),
    altText: draft.alt_text,
    rationale: draft.rationale,
  }));
}
