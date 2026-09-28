import type Database from 'better-sqlite3';

/**
 * Атомарно изпълнение на escrow размяна. Изнесено от routes/trade.ts, за да е
 * директно тестваемо (анти-дупликация е критично за икономиката с реални пари).
 *
 * Гаранции:
 *  • Една транзакция — всичко или нищо.
 *  • Claim на самата размяна (pending→completed) под guard от двойно ready —
 *    двойно извикване не изпълнява два пъти (no double-spend).
 *  • Всеки item се мести с пълния ITEM_GUARD (не е equipped/soul-bound/listed/
 *    vaulted) — CAS с `changes === 1`, иначе rollback.
 *  • Златото е CAS с проверка за наличност — не може да падне под 0.
 */
export const ITEM_GUARD = 'equipped = 0 AND soul_bound = 0 AND listed = 0 AND vaulted_guild_id = 0';

export interface TradeRow {
  id: number;
  from_id: number;
  to_id: number;
  from_items: string; // JSON масив inventory_id
  to_items: string;
  from_gold: number;
  to_gold: number;
}

/**
 * Изпълнява размяната в една транзакция. Хвърля при конфликт (извикващият
 * оставя размяната pending и нулира ready). НЕ праща нотификации — това е
 * отговорност на маршрута.
 */
export function executeTrade(db: Database.Database, fresh: TradeRow): void {
  const fromItems: number[] = JSON.parse(fresh.from_items);
  const toItems: number[] = JSON.parse(fresh.to_items);
  const exec = db.transaction(() => {
    // 1) Claim (pending→completed при все още двойно ready) — anti double-spend.
    const claim = db.prepare(
      `UPDATE trade_offers SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'pending' AND from_ready = 1 AND to_ready = 1`,
    ).run(Date.now(), fresh.id);
    if (claim.changes !== 1) throw new Error('Trade state changed — try again.');
    // 2) Прехвърли items (giver→receiver) с пълен guard.
    const move = (invId: number, giver: number, receiver: number) => {
      const r = db.prepare(
        `UPDATE inventory SET character_id = ?, equipped = 0, slot = '' WHERE id = ? AND character_id = ? AND ${ITEM_GUARD}`,
      ).run(receiver, invId, giver);
      if (r.changes !== 1) throw new Error('An item is no longer tradable.');
    };
    for (const id of fromItems) move(id, fresh.from_id, fresh.to_id);
    for (const id of toItems) move(id, fresh.to_id, fresh.from_id);
    // 3) Злато (CAS: достатъчно наличност).
    const pay = (giver: number, receiver: number, amount: number) => {
      if (amount <= 0) return;
      const d = db.prepare('UPDATE characters SET gold = gold - ? WHERE id = ? AND gold >= ?').run(amount, giver, amount);
      if (d.changes !== 1) throw new Error('Not enough gold.');
      db.prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(amount, receiver);
    };
    pay(fresh.from_id, fresh.to_id, fresh.from_gold);
    pay(fresh.to_id, fresh.from_id, fresh.to_gold);
  });
  exec();
}
