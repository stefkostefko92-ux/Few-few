import { createHash } from 'node:crypto';

/**
 * Одитът на инструментите на модела (FR-12 „log di … tool call“): за всяко извикване — името,
 * ключовете на аргументите и броят на резултатите. Свободният текст на заявките НЕ влиза (може да
 * носи части от въпроса на техника): за низ — само дължина и съкратен SHA-256 (съпоставяне на
 * еднакви заявки без съдържание). Името и ключовете идват от модела (враждебен изход), затова в
 * одита влизат само познатите; непознатите се броят.
 */

/** Познатите инструменти за четене и техните аргументи (`ai/tools.ts`). */
const KNOWN_ARGS: Readonly<Record<string, readonly string[]>> = {
  lookup_error: ['code'],
  search_documents: ['query'],
  get_document_page: ['document_id', 'page'],
};

export type ArgAudit = { type: 'string'; length: number; sha256: string } | { type: string };

export interface ToolCallAudit {
  /** Познато име или „unknown“. */
  name: string;
  argKeys: string[];
  /** Колко ключа не са от схемата на инструмента (стойностите им не влизат никъде). */
  unknownArgKeys: number;
  args: Record<string, ArgAudit>;
  /** Записи, върнати на модела (нови + вече в пакета). */
  results: number;
  isError: boolean;
  /** false — не е изпълнен (таван на кръговете/на извикванията в един ход). */
  executed: boolean;
}

const short = (text: string): string =>
  createHash('sha256').update(text).digest('hex').slice(0, 16);

function argAudit(value: unknown): ArgAudit {
  if (typeof value === 'string')
    return { type: 'string', length: value.length, sha256: short(value) };
  if (typeof value === 'number' || typeof value === 'boolean') return { type: typeof value };
  return { type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value };
}

export function auditToolCall(
  name: string,
  input: unknown,
  outcome: { results: number; isError: boolean },
  executed = true,
): ToolCallAudit {
  const known = Object.hasOwn(KNOWN_ARGS, name) ? (KNOWN_ARGS[name] ?? []) : null;
  const record =
    input !== null && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const keys = Object.keys(record);
  const allowed = known === null ? [] : keys.filter((k) => known.includes(k)).sort();
  const args: Record<string, ArgAudit> = {};
  for (const key of allowed) args[key] = argAudit(record[key]);
  return {
    name: known === null ? 'unknown' : name,
    argKeys: allowed,
    unknownArgKeys: keys.length - allowed.length,
    args,
    results: outcome.results,
    isError: outcome.isError,
    executed,
  };
}
