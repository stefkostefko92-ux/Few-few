import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages/messages';

/** Договорът към модела — истинският е Vertex (само ЕС регион, проверено в config), в тестовете е фалшив. */
export interface DraftModel {
  complete(params: MessageCreateParamsNonStreaming): Promise<string>;
}

export class VertexDraftModel implements DraftModel {
  private readonly client: AnthropicVertex;

  constructor(cfg: { projectId: string; region: string; timeoutMs?: number }) {
    this.client = new AnthropicVertex({
      projectId: cfg.projectId,
      region: cfg.region,
      timeout: cfg.timeoutMs ?? 60_000,
      maxRetries: 2,
    });
  }

  async complete(params: MessageCreateParamsNonStreaming): Promise<string> {
    const msg = await this.client.messages.create(params);
    // Отказ или отрязан отговор не е чернова — опитът се брои за неуспешен.
    if (msg.stop_reason !== 'end_turn') throw new Error(`stop_reason: ${msg.stop_reason}`);
    return msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim();
  }
}
