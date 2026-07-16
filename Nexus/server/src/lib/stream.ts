import type { Response } from 'express';

/**
 * Лек real-time слой чрез Server-Sent Events (SSE) — server→client push за
 * нотификации и чат, за да не разчитаме само на polling. Единично-процесен
 * in-memory регистър (деплойът е един Docker image). НЕ заместваме polling-а
 * — той остава като fallback, ако SSE връзката падне.
 *
 * Auth: краткоживущ ticket (POST /stream/ticket → GET /stream?ticket=…), за
 * да не влиза дълготраен JWT в URL-а (който попада в логове).
 */

interface Conn { res: Response; characterId: number; }
const conns = new Set<Conn>();

/** Регистрира SSE връзка. Връща cleanup функция за close. */
export function addConnection(res: Response, characterId: number): () => void {
  const conn: Conn = { res, characterId };
  conns.add(conn);
  return () => { conns.delete(conn); };
}

/** Push към конкретен герой (ако е свързан). */
export function pushToChar(characterId: number, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of conns) {
    if (c.characterId === characterId) {
      try { c.res.write(payload); } catch { /* връзката ще се почисти при close */ }
    }
  }
}

/** Push към много герои (напр. всички членове на гилдия). */
export function pushToChars(characterIds: number[], event: string, data: unknown): void {
  const set = new Set(characterIds);
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of conns) {
    if (set.has(c.characterId)) {
      try { c.res.write(payload); } catch { /* игнорирай */ }
    }
  }
}

/** Push към ВСИЧКИ свързани (напр. глобален чат). */
export function pushToAll(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of conns) {
    try { c.res.write(payload); } catch { /* ще се почисти при close */ }
  }
}

/** Heartbeat към всички връзки (държи проксита/браузъри живи). */
export function heartbeatAll(): void {
  for (const c of conns) {
    try { c.res.write(': ping\n\n'); } catch { conns.delete(c); }
  }
}

/* ── Ticket store (краткоживущи, еднократни) ─────────────────────────── */
interface Ticket { uid: number; exp: number; }
const tickets = new Map<string, Ticket>();

export function issueTicket(uid: number, token: string): void {
  tickets.set(token, { uid, exp: Date.now() + 60_000 });
}

/** Консумира ticket (еднократен). Връща uid или null. */
export function consumeTicket(token: string): number | null {
  const t = tickets.get(token);
  if (!t) return null;
  tickets.delete(token);
  if (t.exp < Date.now()) return null;
  return t.uid;
}

// Периодично чисти изтекли tickets.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of tickets) if (v.exp < now) tickets.delete(k);
}, 60_000).unref();
