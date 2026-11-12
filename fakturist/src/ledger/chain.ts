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
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Каноничен запис: фиксиран ред на полетата, числата като текст — един и същ вход дава един и същ хеш. */
export function canonical(entry: ChainEntryContent): string {
  return [
    'fakturist-ledger-v1',
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
  ].join('\n');
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

/**
 * Проверява веригата отначало: поредни индекси от 1, всяка връзка към предишния, отпечатъкът спрямо
 * съдържанието и печатът спрямо отпечатъка. Връща първия проблем или null.
 */
export function verifyChain(
  entries: readonly StoredEntry[],
  seal: (hash: string) => string,
): ChainProblem | null {
  let prev = GENESIS;
  let expectedIndex = 1n;
  for (const entry of entries) {
    if (entry.chainIndex !== expectedIndex) return { kind: 'index', at: entry.chainIndex };
    if (entry.prevHash !== prev) return { kind: 'link', at: entry.chainIndex };
    if (entryHash(entry) !== entry.sha256) return { kind: 'hash', at: entry.chainIndex };
    if (seal(entry.sha256) !== entry.seal) return { kind: 'seal', at: entry.chainIndex };
    prev = entry.sha256;
    expectedIndex += 1n;
  }
  return null;
}
