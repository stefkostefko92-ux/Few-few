import { api } from './api';

/**
 * Клиентски SSE консуматор — държи една EventSource връзка към /api/stream
 * и раздава събитията към абонати. Auth е през краткоживущ ticket (POST
 * /stream/ticket), защото EventSource не може да праща Authorization header.
 *
 * Polling-ът в компонентите остава fallback — този слой само ускорява
 * презареждането, когато връзката е жива. При падане пробва reconnect с
 * нарастващ backoff.
 */

type Handler = (data: any) => void;
const handlers = new Map<string, Set<Handler>>();
let es: EventSource | null = null;
let started = false;
let reconnectAt = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** Абонирай се за SSE събитие (напр. „notification", „chat"). */
export function onStream(event: string, fn: Handler): () => void {
  let set = handlers.get(event);
  if (!set) { set = new Set(); handlers.set(event, set); }
  set.add(fn);
  return () => { set!.delete(fn); };
}

function emit(event: string, data: any): void {
  const set = handlers.get(event);
  if (set) for (const fn of set) { try { fn(data); } catch { /* изолирай абонатите */ } }
}

async function connect(): Promise<void> {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  try {
    const { ticket } = await api.post<{ ticket: string }>('/stream/ticket', {});
    const src = new EventSource(`/api/stream?ticket=${encodeURIComponent(ticket)}`);
    es = src;

    src.addEventListener('ready', () => { reconnectAt = 1000; });
    // Известните типове събития от сървъра.
    for (const ev of ['notification', 'chat']) {
      src.addEventListener(ev, (e: MessageEvent) => {
        let data: any = {};
        try { data = e.data ? JSON.parse(e.data) : {}; } catch { /* keep {} */ }
        emit(ev, data);
      });
    }
    src.onerror = () => {
      // EventSource прави собствен reconnect, но при 401 (изтекъл ticket)
      // трябва да вземем нов — затваряме и планираме ръчно свързване.
      src.close();
      if (es === src) es = null;
      scheduleReconnect();
    };
  } catch {
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (!started || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (started) connect();
  }, reconnectAt);
  reconnectAt = Math.min(reconnectAt * 2, 30_000); // до 30s таван
}

/** Стартира потока (извиква се при логин / наличен герой). Идемпотентно. */
export function startStream(): void {
  if (started) return;
  started = true;
  reconnectAt = 1000;
  connect();
}

/** Спира потока (logout). Чисти връзката и таймерите. */
export function stopStream(): void {
  started = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (es) { es.close(); es = null; }
}
