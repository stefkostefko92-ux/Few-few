/**
 * Общи блокове на админ модулите (routes/admin/*.ts): лимит за разрушителни
 * действия, транзакция с HTTP грешка, парсване на тяло, странициран списък,
 * превод на SQLite грешка. Одитът, id/пагинацията и LIKE екранирането живеят
 * в lib/adminKit.ts (споделени и извън админ API-то).
 */
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { z } from 'zod';
import { getDb } from '../../db';
import { escapeLike, pageMeta, type PageQuery } from '../../lib/adminKit';

export type Db = ReturnType<typeof getDb>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

/* ---------------------------------------------------------------
   Rate limit за разрушителни действия (бан, изтриване, разпращане,
   разпускане, отнемане). Общият admin limiter в server.ts е 60/мин —
   изтекъл админ токен не бива да трие/банва на едро.
   --------------------------------------------------------------- */
export const destructiveLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `admin:${req.auth?.uid ?? 'anon'}`,
  message: { error: 'Too many destructive admin actions — wait a minute and try again.' },
});

/** SQLite грешка → коректен HTTP код без изтичане на вътрешни детайли. */
export function sqliteError(res: Response, e: unknown, what: string): void {
  const msg = e instanceof Error ? e.message : '';
  if (/UNIQUE constraint failed/i.test(msg)) {
    const col = msg.split('.').pop() || 'value';
    res.status(409).json({ error: `${what}: ${col} already exists.` });
  } else if (/FOREIGN KEY constraint failed/i.test(msg)) {
    res.status(409).json({ error: `${what} is still referenced and cannot be changed/removed.` });
  } else {
    res.status(500).json({ error: `${what} failed.` });
  }
}

export const pick = (row: Row, keys: string[]) => Object.fromEntries(keys.map((k) => [k, row[k]]));

export function count(db: Db, sql: string, ...params: unknown[]): number {
  try { return (db.prepare(sql).get(...params) as { c: number }).c; } catch { return 0; }
}

/* ===================== Транзакция с HTTP грешка ===================== */

/** Хвърля се в транзакция → rollback + отговор с този статус. */
export class AdminError extends Error {
  constructor(public status: 400 | 404 | 409, message: string) { super(message); }
}
export const fail = (status: 400 | 404 | 409, message: string): never => { throw new AdminError(status, message); };

/**
 * Изпълнява `fn` в една транзакция. AdminError → rollback и `{ error }` със
 * статуса му; друга грешка → sqliteError. Връща `{ value }` при успех, иначе
 * null (отговорът вече е пратен).
 */
export function inTx<T>(res: Response, what: string, fn: (db: Db) => T): { value: T } | null {
  const db = getDb();
  try {
    return { value: db.transaction(() => fn(db))() };
  } catch (e) {
    if (e instanceof AdminError) res.status(e.status).json({ error: e.message });
    else sqliteError(res, e, what);
    return null;
  }
}

/** Парсва тялото със zod схема; при грешка праща 400 и връща null. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request, res: Response): z.infer<T> | null {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) {
    res.status(400).json({ error: r.error.flatten() });
    return null;
  }
  return r.data;
}

/* ===================== Странициран списък ===================== */

export interface ListSpec {
  /** SELECT колони (без SELECT). */
  select: string;
  /** FROM … JOIN … (без WHERE). */
  from: string;
  where: string[];
  params: unknown[];
  orderBy: string;
  /** Колони за LIKE търсене по `q`; числово `q` търси и по `idCol`. */
  search?: { cols: string[]; idCol?: string };
}

/** Общ списък с броене, търсене (LIKE с екраниране) и страници. */
export function listPage(db: Db, spec: ListSpec, q: PageQuery) {
  const where = [...spec.where];
  const params = [...spec.params];
  if (q.q && spec.search) {
    const like = `%${escapeLike(q.q)}%`;
    const parts = spec.search.cols.map((c) => `${c} LIKE ? ESCAPE '\\'`);
    params.push(...spec.search.cols.map(() => like));
    if (spec.search.idCol) { parts.push(`${spec.search.idCol} = ?`); params.push(/^\d+$/.test(q.q) ? Number(q.q) : -1); }
    where.push(`(${parts.join(' OR ')})`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM ${spec.from} ${w}`).get(...params) as { c: number }).c;
  const rows = db.prepare(`SELECT ${spec.select} FROM ${spec.from} ${w} ORDER BY ${spec.orderBy} LIMIT ? OFFSET ?`)
    .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as Row[];
  return { ...pageMeta(total, q), rows };
}

/** Подрежда предмет в инвентара: отвари/материали се трупат, екипировката е по ред на брой. */
export function grantItem(db: Db, characterId: number, item: { id: number; category: string }, qty: number, opts: { soulBound?: boolean } = {}): void {
  const sb = opts.soulBound ? 1 : 0;
  if (item.category === 'potion' || item.category === 'misc') {
    const ex = db.prepare('SELECT id FROM inventory WHERE character_id = ? AND item_id = ? AND equipped = 0 AND listed = 0 AND vaulted_guild_id = 0 AND soul_bound = ? LIMIT 1')
      .get(characterId, item.id, sb) as { id: number } | undefined;
    if (ex) { db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(qty, ex.id); return; }
    db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot, soul_bound) VALUES (?, ?, ?, 0, '', ?)").run(characterId, item.id, qty, sb);
    return;
  }
  const ins = db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot, soul_bound) VALUES (?, ?, 1, 0, '', ?)");
  for (let i = 0; i < qty; i++) ins.run(characterId, item.id, sb);
}
