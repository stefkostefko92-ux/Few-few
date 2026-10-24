import type Database from 'better-sqlite3';
import { detachFromGuild } from '../game/guild';

/**
 * Пълно изтриване на потребител — споделено от self-delete (account.ts,
 * GDPR чл. 17) и админ DELETE /users. Изпълни ВЪТРЕ в транзакция.
 *
 * Защо helper: `DELETE FROM users` каскадира през characters/* (ON DELETE
 * CASCADE), НО `guilds.leader_id REFERENCES characters(id)` е без ON DELETE
 * action (RESTRICT) → ако герой на потребителя води гилдия, триенето хвърля
 * FK грешка и целият DELETE се проваля (Кодаджията: High). Затова първо
 * героите излизат от гилдиите си (game/guild.ts → detachFromGuild: наследник
 * по ранг/стаж, празна гилдия се разпуска), после чистим PII, което живее извън каскадата (event_log), и
 * освобождаваме/отменяме следите в purchases/marketplace.
 */
export function eraseUser(db: Database.Database, uid: number): void {
  // 1) Гилдии: всеки герой на потребителя излиза през общия helper —
  //    лидерството минава на най-високия по ранг/стаж член (маха leader_id
  //    RESTRICT блокера), а само ПРАЗНА гилдия се разпуска. Преди гилдията
  //    се разпускаше заедно с всички други членове и трезора им.
  for (const c of db.prepare('SELECT id FROM characters WHERE user_id = ?').all(uid) as { id: number }[]) {
    detachFromGuild(db, c.id, { deleting: true });
  }
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
