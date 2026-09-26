import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import type {
  MessageCreateParamsStreaming,
  MessageParam,
  RawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/messages/messages';
import type { Config } from './config.js';
import { PUBLIC_DOCTRINE, type AgentProfile } from './profiles.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Минималният договор към модела — истинският е Vertex, в тестовете е фалшив (без мрежа).
 * `open` хвърля ПРЕДИ стрийма (HTTP грешка от доставчика), затова SSE хедърите се пращат
 * едва след успешно отваряне и грешките стигат до клиента с правилен HTTP код.
 */
export interface ChatModel {
  open(
    params: MessageCreateParamsStreaming,
    signal: AbortSignal,
  ): Promise<AsyncIterable<RawMessageStreamEvent>>;
}

export function modelFor(profile: AgentProfile, cfg: Pick<Config, 'MODEL_OPUS' | 'MODEL_SONNET'>) {
  return profile.tier === 'opus' ? cfg.MODEL_OPUS : cfg.MODEL_SONNET;
}

/**
 * Стабилното ОТПРЕД (доктрина + профил, с cache_control), променливото ОТЗАД (разговорът).
 * Втори breakpoint на последното съобщение — следващият ход на същия разговор чете
 * предишния префикс от кеша. effort е постоянен (от конфигурация) — смяната му инвалидира кеша.
 * Нула инструменти: `tools` не се подава изобщо.
 */
export function buildParams(
  profile: AgentProfile,
  messages: ChatMessage[],
  cfg: Pick<Config, 'MODEL_OPUS' | 'MODEL_SONNET' | 'CHAT_EFFORT' | 'MAX_OUTPUT_TOKENS'>,
): MessageCreateParamsStreaming {
  const last = messages.length - 1;
  const convo: MessageParam[] = messages.map((m, i) => ({
    role: m.role,
    content: [
      i === last
        ? { type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }
        : { type: 'text', text: m.content },
    ],
  }));
  return {
    model: modelFor(profile, cfg),
    max_tokens: cfg.MAX_OUTPUT_TOKENS,
    stream: true,
    system: [
      { type: 'text', text: PUBLIC_DOCTRINE },
      {
        type: 'text',
        text: `# ${profile.name} — ${profile.title}\n\n${profile.text}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    thinking: { type: 'adaptive', display: 'omitted' },
    output_config: { effort: cfg.CHAT_EFFORT },
    messages: convo,
  };
}

/** Истинският клиент: Google Vertex AI, само ЕС регион (проверено в config). */
export class VertexChatModel implements ChatModel {
  private readonly client: AnthropicVertex;

  constructor(cfg: Pick<Config, 'VERTEX_PROJECT_ID' | 'VERTEX_REGION' | 'UPSTREAM_TIMEOUT_MS'>) {
    this.client = new AnthropicVertex({
      projectId: cfg.VERTEX_PROJECT_ID,
      region: cfg.VERTEX_REGION,
      timeout: cfg.UPSTREAM_TIMEOUT_MS,
      // Повторни опити само преди стрийма (429/5xx/мрежа) — SDK ги прави с нарастващо чакане.
      maxRetries: 2,
    });
  }

  async open(
    params: MessageCreateParamsStreaming,
    signal: AbortSignal,
  ): Promise<AsyncIterable<RawMessageStreamEvent>> {
    return this.client.messages.create(params, { signal });
  }
}
