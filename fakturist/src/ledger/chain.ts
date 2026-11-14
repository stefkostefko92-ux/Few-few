import { createHash } from 'node:crypto';

/**
 * Веригата на издадените документи на една фирма: всеки документ носи SHA-256 отпечатък на каноничното си
 * съдържание и отпечатъка на предишния. Печатът е HMAC върху отпечатъка с ключ само на сървъра — който
 * има достъп до базата, но не и до ключа, не може да пренапише документ и веригата след него, без това
 * да се види. Така се доказва целостта по чл. 114, ал. 6 ЗДДС и чл. 121, ал. 2 ЗДДС.
 */
export const GENESIS = '0'.repeat(64);

export interface ChainEntryContent {
  organizationId: string;
  chainIndex: bigint;
  number: string;
  typeCode: string;
  status: 'ISSUED';
  issueDate: string;
  payableCents: bigint;
  vatCents: bigint;
  ublSha256: string;
  ciiSha256: string;
  prevHash: string;
  /**
   * Отпечатъкът на входа, от който се рисува PDF-ът (v2, от одита на 13.11.2026). Липсва — звено v1 от
   * преди това: тогава записът е старият и се проверява по стария начин.
   */
  inputSha256?: string | null;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Каноничен запис: фиксиран ред на полетата, числата като текст — един и същ вход дава един и същ хеш. */
export function canonical(entry: ChainEntryContent): string {
  return [
    entry.inputSha256 ? 'fakturist-ledger-v2' : 'fakturist-ledger-v1',
    entry.organizationId,
    entry.chainIndex.toString(),
    entry.number,
    entry.typeCode,
    entry.status,
    entry.issueDate,
    entry.payableCents.toString(),
    entry.vatCents.toString(),
    entry.ublSha256,
    entry.ciiSha256,
    entry.prevHash,
    ...(entry.inputSha256 ? [entry.inputSha256] : []),
  ].join('\n');
}

/** JSON с подредени ключове — един и същ вход дава един и същ текст и след запис в jsonb. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Отпечатъкът на записания вход (както е в базата — затова през JSON и подредени ключове). */
export function inputHash(input: unknown): string {
  return sha256(canonicalJson(JSON.parse(JSON.stringify(input ?? null))));
}

export function entryHash(entry: ChainEntryContent): string {
  return sha256(canonical(entry));
}

export interface StoredEntry extends ChainEntryContent {
  sha256: string;
  seal: string;
}

export type ChainProblem =
  | { kind: 'index'; at: bigint }
  | { kind: 'link'; at: bigint }
  | { kind: 'hash'; at: bigint }
  | { kind: 'seal'; at: bigint };

export interface ChainState {
  prevHash: string;
  nextIndex: bigint;
}

export const CHAIN_START: ChainState = { prevHash: GENESIS, nextIndex: 1n };

/**
 * Проверява поредица от звена, продължавайки от `state` (така голяма верига се проверява на страници, без
 * да се зарежда цялата в паметта): поредни индекси, връзка към предишния, отпечатък спрямо съдържанието,
 * печат спрямо отпечатъка. Връща първия проблем или новото състояние.
 */
export function verifyChainFrom(
  entries: readonly StoredEntry[],
  seal: (hash: string) => string,
  state: ChainState,
): { problem: ChainProblem | null; state: ChainState } {
  let { prevHash, nextIndex } = state;
  for (const entry of entries) {
    const at = entry.chainIndex;
    if (at !== nextIndex) return { problem: { kind: 'index', at }, state };
    if (entry.prevHash !== prevHash) return { problem: { kind: 'link', at }, state };
    if (entryHash(entry) !== entry.sha256) return { problem: { kind: 'hash', at }, state };
    if (seal(entry.sha256) !== entry.seal) return { problem: { kind: 'seal', at }, state };
    prevHash = entry.sha256;
    nextIndex += 1n;
  }
  return { problem: null, state: { prevHash, nextIndex } };
}

/** Цялата верига отначало. Връща първия проблем или null. */
export function verifyChain(
  entries: readonly StoredEntry[],
  seal: (hash: string) => string,
): ChainProblem | null {
  return verifyChainFrom(entries, seal, CHAIN_START).problem;
}
