import type {
  ContentBlockParam,
  MessageParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages';
import type { ModelDiagnosis } from '../domain/response.js';
import type { ModelPhoto } from './attachments.js';

/** Сглобяването на съобщенията към модела — отделено от цикъла на оркестратора. */

/** Историята на случая — последните ходове, всеки отрязан (цена и контекст). */
const MAX_HISTORY = 12;
const MAX_HISTORY_CHARS = 4000;

/** Кодове за UI (като `gate.*`) — защо отговорът е безопасен отказ. */
export type FailureCode = 'ai.invalidOutput' | 'ai.noSubmission' | 'ai.refusal';

export function historyMessages(
  history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>,
): MessageParam[] {
  const out: MessageParam[] = [];
  for (const h of history.slice(-MAX_HISTORY)) {
    const text = h.content.trim().slice(0, MAX_HISTORY_CHARS);
    if (text.length === 0) continue;
    if (out.length === 0 && h.role === 'assistant') continue; // разговорът започва с потребител
    const last = out[out.length - 1];
    if (last && last.role === h.role && Array.isArray(last.content)) {
      last.content.push({ type: 'text', text });
    } else {
      out.push({ role: h.role, content: [{ type: 'text', text }] });
    }
  }
  return out;
}

/**
 * Съдържанието на хода на случая: снимките ПРЕДИ текста (по документацията на Anthropic
 * изображение → текст дава по-добър резултат), всяка с етикет „Photo P1:“; breakpoint-ът за кеша
 * е на последния блок, така че кръговете с инструменти четат и снимките от кеша.
 * Само base64 — на Google Cloud (Vertex) URL/Files API източници не се поддържат.
 */
export function caseContent(photos: readonly ModelPhoto[], caseText: string): ContentBlockParam[] {
  const blocks: ContentBlockParam[] = [];
  for (const p of photos) {
    blocks.push({ type: 'text', text: `Photo ${p.ref}:` });
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: p.mediaType, data: p.data },
    });
  }
  blocks.push({ type: 'text', text: caseText, cache_control: { type: 'ephemeral' } });
  return blocks;
}

export function safeDraft(code: FailureCode): ModelDiagnosis {
  return {
    status: 'undetermined',
    confidence: 'low',
    confidenceReason: code,
    summary: code,
    causes: [],
    checks: [],
    decisionPoints: [],
    evidenceUsed: [],
    conflicts: [],
    safetyNotes: [],
    missingData: [],
    escalation: { recommended: true, reason: code },
  };
}

export function toolResult(id: string, content: string, isError: boolean): ToolResultBlockParam {
  return isError
    ? { type: 'tool_result', tool_use_id: id, content, is_error: true }
    : { type: 'tool_result', tool_use_id: id, content };
}
