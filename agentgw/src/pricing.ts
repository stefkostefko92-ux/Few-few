/**
 * List цени в USD за милион токена (platform.claude.com/docs/en/about-claude/pricing,
 * сверено 2026-09-25). Кеш запис 5 мин = 1.25× вход; кеш четене = 0.1× (Opus 5.5: 0.05×).
 * Vertex регионална/мулти-регионална крайна точка: +10% → PRICE_MULTIPLIER.
 */
export interface Price {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export const PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
  'claude-opus-5': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  'claude-sonnet-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Разход в микро-USD, закръглен нагоре (по-добре да надценим с микродолар, отколкото
 * таванът да изтече). Непознат модел → най-скъпата известна цена (fail-closed).
 */
export function costMicroUsd(model: string, u: TokenUsage, multiplier: number): bigint {
  const p = PRICES[model] ?? PRICES['claude-opus-5']!;
  // цена за MTok в USD = микро-USD за токен
  const micro =
    u.inputTokens * p.input +
    u.cacheWriteTokens * p.cacheWrite +
    u.cacheReadTokens * p.cacheRead +
    u.outputTokens * p.output;
  // toFixed срязва шума на плаващата запетая (7000 × 1.1 = 7700.000000000001), после нагоре.
  return BigInt(Math.ceil(Number((micro * multiplier).toFixed(6))));
}
