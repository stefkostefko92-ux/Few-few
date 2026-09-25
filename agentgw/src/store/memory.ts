import { randomUUID } from 'node:crypto';
import type { AuditEntry, KeyRecord, NewKey, Store, UsageDelta, UsageTotals } from '../keys.js';
import { auditHash } from './audit-hash.js';

const empty = (month: string): UsageTotals => ({
  month,
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costMicroUsd: 0n,
});

/** Хранилище в паметта — за тестове и локална разработка без база. */
export class MemoryStore implements Store {
  readonly keys = new Map<string, KeyRecord>();
  readonly usage = new Map<string, UsageTotals>();
  readonly auditLog: Array<AuditEntry & { at: Date; prevHash: string; hash: string }> = [];

  async createKey(input: NewKey & { hash: string; prefix: string }): Promise<KeyRecord> {
    const rec: KeyRecord = {
      id: randomUUID(),
      ...input,
      active: true,
      createdAt: new Date(),
      revokedAt: null,
    };
    this.keys.set(rec.id, rec);
    return rec;
  }

  async findKeyByHash(hash: string): Promise<KeyRecord | null> {
    for (const k of this.keys.values()) if (k.hash === hash) return k;
    return null;
  }

  async findKey(idOrPrefix: string): Promise<KeyRecord | null> {
    const direct = this.keys.get(idOrPrefix);
    if (direct) return direct;
    const hits = [...this.keys.values()].filter((k) => k.prefix.startsWith(idOrPrefix));
    return hits.length === 1 ? hits[0]! : null;
  }

  async listKeys(): Promise<KeyRecord[]> {
    return [...this.keys.values()];
  }

  async updateKey(
    id: string,
    patch: Partial<Pick<KeyRecord, 'agents' | 'origins' | 'capMicroUsd' | 'ratePerMin'>> & {
      revoke?: boolean;
    },
  ): Promise<KeyRecord> {
    const rec = this.keys.get(id);
    if (!rec) throw new Error('Няма такъв ключ');
    const { revoke, ...rest } = patch;
    Object.assign(rec, rest);
    if (revoke) {
      rec.active = false;
      rec.revokedAt = new Date();
    }
    return rec;
  }

  async activePublicOrigins(): Promise<Set<string>> {
    const out = new Set<string>();
    for (const k of this.keys.values())
      if (k.active && k.kind === 'PUBLIC') k.origins.forEach((o) => out.add(o));
    return out;
  }

  async monthUsage(keyId: string, month: string): Promise<UsageTotals> {
    return this.usage.get(`${keyId}:${month}`) ?? empty(month);
  }

  async addUsage(keyId: string, month: string, d: UsageDelta): Promise<void> {
    const cur = { ...(this.usage.get(`${keyId}:${month}`) ?? empty(month)) };
    cur.requests += 1;
    cur.inputTokens += d.inputTokens;
    cur.outputTokens += d.outputTokens;
    cur.cacheReadTokens += d.cacheReadTokens;
    cur.cacheWriteTokens += d.cacheWriteTokens;
    cur.costMicroUsd += d.costMicroUsd;
    this.usage.set(`${keyId}:${month}`, cur);
  }

  async audit(entry: AuditEntry): Promise<void> {
    const prevHash = this.auditLog.at(-1)?.hash ?? '';
    const at = new Date();
    this.auditLog.push({ ...entry, at, prevHash, hash: auditHash(prevHash, at, entry) });
  }
}
