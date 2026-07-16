import type Database from 'better-sqlite3';
import { pushToChar } from './stream';

export type NotifKind = 'friend_request' | 'friend_accept' | 'guild_invite' | 'trade' | 'system';

/**
 * Създава in-app нотификация за герой. Тънък helper — извиква се от
 * social/guild/trade маршрутите. `ref` е опционална препратка (напр.
 * „char:42" / „trade:7") за deep-link от feed-а.
 */
export function notify(db: Database.Database, characterId: number, kind: NotifKind, message: string, ref = ''): void {
  try {
    db.prepare(
      'INSERT INTO notifications (character_id, kind, message, ref, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(characterId, kind, message.slice(0, 300), ref.slice(0, 80), Date.now());
    // Live push (SSE) — клиентът презарежда камбанката веднага. Polling-ът
    // остава fallback, ако връзката не е активна.
    pushToChar(characterId, 'notification', { kind, message });
  } catch { /* notifications table added by forward migration */ }
}
