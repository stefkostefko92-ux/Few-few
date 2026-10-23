import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages/messages';
import { EU_REGION, type Config } from '../config.js';

/**
 * Минималният договор към модела — истинският е Vertex AI (само ЕС), в тестовете е фалшив
 * (без мрежа). Без стрийм: отговорът минава през валидация и Safety Gate, преди да стигне до
 * техника, затова частичен текст няма какво да показва.
 */
export interface DiagnosisModel {
  create(params: MessageCreateParamsNonStreaming, signal: AbortSignal): Promise<Message>;
}

/**
 * Истинският клиент: Google Vertex AI, само ЕС регион. `eu` = мулти-регионалната крайна точка
 * (aiplatform.eu.rep.googleapis.com); единичните `europe-*` по документацията носят само по-стари
 * модели — Opus 5 / Sonnet 5 искат `eu` (урокът от agentgw). Никога директен Anthropic API.
 */
export class VertexDiagnosisModel implements DiagnosisModel {
  private readonly client: AnthropicVertex;

  constructor(cfg: Pick<Config, 'VERTEX_PROJECT_ID' | 'VERTEX_REGION' | 'AI_TIMEOUT_MS'>) {
    // Конфигът вече го проверява; второ заключване, ако някой подаде ръчно сглобен обект.
    if (!EU_REGION.test(cfg.VERTEX_REGION)) {
      throw new Error(`VERTEX_REGION „${cfg.VERTEX_REGION}“ не е ЕС регион`);
    }
    if (cfg.VERTEX_PROJECT_ID.length === 0) throw new Error('Липсва VERTEX_PROJECT_ID');
    this.client = new AnthropicVertex({
      projectId: cfg.VERTEX_PROJECT_ID,
      region: cfg.VERTEX_REGION,
      timeout: cfg.AI_TIMEOUT_MS,
      // Повторни опити при 429/5xx/мрежа — SDK ги прави с нарастващо чакане (като agentgw).
      maxRetries: 2,
    });
  }

  async create(params: MessageCreateParamsNonStreaming, signal: AbortSignal): Promise<Message> {
    return this.client.messages.create(params, { signal });
  }
}
