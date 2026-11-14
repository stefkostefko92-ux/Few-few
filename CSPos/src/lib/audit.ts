// Одиторска следа по Прил. № 29, т. 15–16: само добавяне, УНП като отделно поле при сторно и
// анулиране, хеш верига срещу подмяна (т. 4, т. 13). Тя е и доказателствената база за
// материалната отговорност на касиера (чл. 207 КТ).
//
// Записите се правят ЕДИН ПО ЕДИН в процеса (опашка): всеки взема хеша на предишния, а часът
// е строго нарастващ — иначе два записа в една милисекунда биха разклонили веригата.

import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { auditHash, type ChainResult } from "./audit-chain";

let tail: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  return run;
}

export interface AuditOptions {
  /** УНП на продажбата — задължително при сторниране и анулиране (т. 15, б. „б“). */
  unp?: string | null;
}

export async function audit(
  userId: string | null,
  action: string,
  entity?: string,
  entityId?: string,
  detail?: unknown,
  opts: AuditOptions = {}
): Promise<void> {
  await serial(async () => {
    const last = await prisma.auditLog.findFirst({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { hash: true, createdAt: true },
    });
    const now = Date.now();
    const createdAt = new Date(last && last.createdAt.getTime() >= now ? last.createdAt.getTime() + 1 : now);
    const row = {
      id: randomUUID(),
      createdAt: createdAt.toISOString(),
      userId,
      action,
      entity: entity ?? null,
      entityId: entityId ?? null,
      unp: opts.unp ?? null,
      detail: detail === undefined ? null : JSON.stringify(detail),
    };
    const prevHash = last?.hash ?? "";
    await prisma.auditLog.create({
      data: { ...row, createdAt, prevHash, hash: auditHash(prevHash, row) },
    });
  });
}

/** Проверка на цялата верига по реда на записване (на порции — дневникът расте с години). */
export async function verifyAuditChain(): Promise<ChainResult> {
  const BATCH = 2000;
  let prev = "";
  let started = false;
  let legacy = 0;
  let checked = 0;
  let cursor: { createdAt: Date; id: string } | null = null;
  for (;;) {
    const page: Array<{
      id: string;
      createdAt: Date;
      userId: string | null;
      action: string;
      entity: string | null;
      entityId: string | null;
      unp: string | null;
      detail: string | null;
      prevHash: string | null;
      hash: string | null;
    }> = await prisma.auditLog.findMany({
      where: cursor
        ? {
            OR: [
              { createdAt: { gt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { gt: cursor.id } },
            ],
          }
        : {},
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: BATCH,
    });
    if (page.length === 0) break;
    for (const e of page) {
      if (!started && e.hash === null) {
        legacy++;
        continue;
      }
      started = true;
      const entry = { ...e, createdAt: e.createdAt.toISOString() };
      if (e.hash === null || (e.prevHash ?? "") !== prev || auditHash(prev, entry) !== e.hash) {
        return { ok: false, checked, brokenAt: e.id, ...(legacy ? { legacy } : {}) };
      }
      prev = e.hash;
      checked++;
    }
    const lastRow = page[page.length - 1]!;
    cursor = { createdAt: lastRow.createdAt, id: lastRow.id };
  }
  return { ok: true, checked, ...(legacy ? { legacy } : {}) };
}
