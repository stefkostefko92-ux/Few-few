import type Database from 'better-sqlite3';

/**
 * Пълно изтриване на потребител — споделено от self-delete (account.ts,
 * GDPR чл. 17) и админ DELETE /users. Изпълни ВЪТРЕ в транзакция.
 *
 * Защо helper: `DELETE FROM users` каскадира през characters/* (ON DELETE
 * CASCADE), НО `guilds.leader_id REFERENCES characters(id)` е без ON DELETE
 * action (RESTRICT) → ако герой на потребителя води гилдия, триенето хвърля
 * FK грешка и целият DELETE се проваля (Кодаджията: High). Затова първо
 * разпускаме гилдиите, водени от негови герои (каскадира членове/чат/война/
 * трезор), после чистим PII, което живее извън каскадата (event_log), и
 * освобождаваме/отменяме следите в purchases/marketplace.
 */
export function eraseUser(db: Database.Database, uid: number): void {
  // 1) Разпусни гилдиите, водени от герой на потребителя (маха leader_id
  //    RESTRICT блокера; guild_* децата са ON DELETE CASCADE).
  db.prepare(
    `DELETE FROM guilds WHERE leader_id IN (SELECT id FROM characters WHERE user_id = ?)`,
  ).run(uid);
  // 2) Плащания — задръж записа за ДДС, но откачи от героя (псевдонимизация).
  db.prepare(
    `UPDATE purchases SET character_id = NULL
       WHERE character_id IN (SELECT id FROM characters WHERE user_id = ?)`,
  ).run(uid);
  // 3) Отмени активните обяви (иначе hard-каскада оставя купувач „в сделка").
  db.prepare(
    `UPDATE marketplace_listings SET status = 'cancelled'
       WHERE seller_id IN (SELECT id FROM characters WHERE user_id = ?)
         AND status = 'active'`,
  ).run(uid);
  // 4) event_log живее извън FK каскадата и държи user_id + ip → чисти го
  //    (GDPR чл. 17 — одитната следа също се маха).
  db.prepare('DELETE FROM event_log WHERE user_id = ?').run(uid);
  // 5) Самият потребител → каскадира през characters/*.
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
}
