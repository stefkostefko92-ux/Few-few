/**
 * List цени в USD за милион токена (platform.claude.com/docs/en/about-claude/pricing,
 * сверено 2026-11-19). Кеш запис 5 мин = 1.25× вход; кеш четене = 0.1× вход
 * (Opus 5.5 и Sonnet 5.5: 0.05×). Vertex регионална/мулти-регионална крайна точка: +10% →
 * PRICE_MULTIPLIER. Нов модел = нов ред тук; без ред шлюзът не стартира (виж config.ts).
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
  'claude-sonnet-5-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 },
  'claude-sonnet-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
};

/** Най-високата известна цена по ВСЯКА категория поотделно — за непознат модел. */
const CEILING: Price = Object.values(PRICES).reduce(
  (m, p) => ({
    input: Math.max(m.input, p.input),
    cacheWrite: Math.max(m.cacheWrite, p.cacheWrite),
    cacheRead: Math.max(m.cacheRead, p.cacheRead),
    output: Math.max(m.output, p.output),
  }),
  { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
);

export function hasPrice(model: string): boolean {
  return Object.hasOwn(PRICES, model);
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Горна оценка на входните токени, когато моделът не е върнал `usage` (прекъсване преди
 * `message_start`): UTF-8 байтовете на системния промпт и разговора в JSON. Всеки токен е поне
 * един байт текст, а JSON обвивката само добавя — на практика ≥ 2 байта на токен, така че
 * покрива и кеш записа (1.25× вход).
 */
export function inputTokensUpperBound(params: { system?: unknown; messages: unknown }): number {
  return (
    Buffer.byteLength(JSON.stringify(params.system ?? '')) +
    Buffer.byteLength(JSON.stringify(params.messages))
  );
}

/**
 * Разход в микро-USD, закръглен нагоре (по-добре да надценим с микродолар, отколкото
 * таванът да изтече). Непознат модел не стига дотук — конфигурацията го спира при старт;
 * ако все пак стигне, таксуваме по тавана на всички известни цени (fail-closed), не по
 * цената на произволен друг модел.
 */
export function costMicroUsd(model: string, u: TokenUsage, multiplier: number): bigint {
  const p = hasPrice(model) ? PRICES[model]! : CEILING;
  // цена за MTok в USD = микро-USD за токен
  const micro =
    u.inputTokens * p.input +
    u.cacheWriteTokens * p.cacheWrite +
    u.cacheReadTokens * p.cacheRead +
    u.outputTokens * p.output;
  // toFixed срязва шума на плаващата запетая (7000 × 1.1 = 7700.000000000001), после нагоре.
  return BigInt(Math.ceil(Number((micro * multiplier).toFixed(6))));
}
