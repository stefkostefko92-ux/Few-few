// Хеш верига на одиторския дневник (Прил. № 29, т. 4 и т. 13 — откриване на манипулация).
// Всеки запис носи SHA-256(предишен хеш + съдържанието си). Подмяна, вмъкване или изтриване
// на запис чупи веригата от това място нататък — проверката показва първия счупен запис.

import { createHash } from "node:crypto";

export interface ChainEntry {
  id: string;
  createdAt: string; // ISO
  userId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  unp: string | null;
  detail: string | null;
  prevHash: string | null;
  hash: string | null;
}

export function auditHash(prevHash: string, e: Omit<ChainEntry, "hash" | "prevHash">): string {
  const payload = JSON.stringify([
    prevHash,
    e.id,
    e.createdAt,
    e.userId,
    e.action,
    e.entity,
    e.entityId,
    e.unp,
    e.detail,
  ]);
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export type ChainResult =
  | { ok: true; checked: number; legacy?: number }
  | { ok: false; checked: number; brokenAt: string; legacy?: number };

/**
 * Проверява веригата в реда на записване. Записи без хеш в НАЧАЛОТО са отпреди веригата
 * (стара база) и се отчитат отделно; запис без хеш след началото на веригата е пробив.
 */
export function verifyChain(entries: ChainEntry[]): ChainResult {
  let i = 0;
  while (i < entries.length && entries[i]!.hash === null) i++;
  const legacy = i;
  const extra = legacy > 0 ? { legacy } : {};
  let prev = "";
  let checked = 0;
  for (; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.hash === null || (e.prevHash ?? "") !== prev || auditHash(prev, e) !== e.hash) {
      return { ok: false, checked, brokenAt: e.id, ...extra };
    }
    prev = e.hash;
    checked++;
  }
  return { ok: true, checked, ...extra };
}
