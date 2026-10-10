/**
 * Хъбът за реално време (§13.3 „договор за сигурност realtime“, NFR-11): отворените SSE потоци
 * на ЕДИН процес, подредени по потребител. Хоризонтално мащабиране (втори процес/машина) иска
 * pub/sub (Redis, Postgres LISTEN/NOTIFY) между хъбовете — описано в CLAUDE.md; дотогава събитие,
 * родено в друг процес, не стига до тукашните потоци и клиентът го вижда при презареждане по REST.
 *
 * Сигурността: хъбът НЕ знае правилата за достъп. Всяко събитие идва с `authorize`, който се вика
 * В МОМЕНТА на изпращане за свързаните получатели и връща какво точно вижда всеки (по текущите
 * му права — членството се проверява наново). Получател извън резултата не получава нищо.
 * Събитията се обработват едно след друго — редът на изпращане е редът на публикуване.
 */

export const SCHEMA_VERSION = 1;

export type RealtimeEventType =
  | 'message.created'
  | 'message.updated'
  | 'conversation.updated'
  | 'presence.changed'
  | 'notification.created'
  | 'case.assigned'
  // Работният поток на тикета и стъпките (FR-09, FR-19, §11.2) — само идентификатори и статуси.
  | 'case.updated'
  | 'step.updated'
  | 'queue.updated';

export interface RealtimeEvent {
  type: RealtimeEventType;
  tenantId: string;
  conversationId?: string | null;
  actorId: string | null;
}

/** Кандидатите за получатели — списък или изчисление (напр. текущите членове от базата). */
export type Recipients = readonly string[] | (() => Promise<readonly string[]>);

/** Получателите, които още имат право, и данните, които всеки от тях вижда. */
export type Authorizer = (
  userIds: readonly string[],
) => Promise<ReadonlyMap<string, Record<string, unknown>>>;

/** Един отворен поток (един таб/устройство) — сесията и клиентът са от момента на отваряне. */
export interface StreamSink {
  userId: string;
  sessionId: string;
  tenantId: string;
  write(chunk: string): void;
  end(): void;
}

export interface HubOptions {
  /** Таван на потоците на човек — най-старият се затваря (защита от изчерпване на ресурси). */
  maxStreamsPerUser?: number;
  /** Heartbeat коментар + повторна проверка на сесията (25 s — под 60 s таймаута на проксито). */
  heartbeatMs?: number;
  now?: () => Date;
  onError?: (err: unknown) => void;
  /**
   * Наблюдаемост (NFR-11): след всяко събитие — типът, изходът и секундите от публикуването до
   * записа в потоците (опашка + получатели + права). Без получатели и без съдържание.
   */
  onPublished?: (type: RealtimeEventType, result: PublishResult, seconds: number) => void;
}

export type PublishResult = 'delivered' | 'no_recipients' | 'error';

/** Форматът на рамката (text/event-stream): монотонен `id`, тип и JSON на един ред. */
export function sseFrame(id: number, type: string, payload: unknown): string {
  return `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export class RealtimeHub {
  private seq = 0;
  private readonly streams = new Map<string, Set<StreamSink>>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly maxStreams: number;
  private readonly now: () => Date;
  private readonly onError: (err: unknown) => void;
  private readonly onPublished: HubOptions['onPublished'];
  readonly heartbeatMs: number;

  constructor(opts: HubOptions = {}) {
    this.maxStreams = opts.maxStreamsPerUser ?? 5;
    this.heartbeatMs = opts.heartbeatMs ?? 25_000;
    this.now = opts.now ?? (() => new Date());
    this.onError = opts.onError ?? (() => undefined);
    this.onPublished = opts.onPublished;
  }

  /** Записва потока; връща функцията за отписване (при затваряне на връзката). */
  attach(sink: StreamSink): () => void {
    const set = this.streams.get(sink.userId) ?? new Set<StreamSink>();
    this.streams.set(sink.userId, set);
    set.add(sink);
    while (set.size > this.maxStreams) {
      const oldest = set.values().next().value as StreamSink;
      this.drop(oldest);
    }
    return () => this.detach(sink);
  }

  private detach(sink: StreamSink): void {
    const set = this.streams.get(sink.userId);
    if (!set) return;
    set.delete(sink);
    if (set.size === 0) this.streams.delete(sink.userId);
  }

  private drop(sink: StreamSink): void {
    this.detach(sink);
    try {
      sink.end();
    } catch (err) {
      this.onError(err);
    }
  }

  /** Колко потока са отворени (за човека или общо). */
  size(userId?: string): number {
    if (userId) return this.streams.get(userId)?.size ?? 0;
    let total = 0;
    for (const set of this.streams.values()) total += set.size;
    return total;
  }

  /**
   * Публикува събитие. Получателите може да са функция — изчислява се В опашката, за да не
   * размести реда на събитията. Само свързаните стигат до `authorize` (офлайн хората не струват
   * заявка към базата). Връща броя на потоците, в които е записано.
   */
  publish(event: RealtimeEvent, recipients: Recipients, authorize: Authorizer): Promise<number> {
    const queuedAt = performance.now();
    const run = async (): Promise<number> => {
      if (this.streams.size === 0) return 0;
      const list = typeof recipients === 'function' ? await recipients() : recipients;
      const connected = [...new Set(list)].filter((id) => this.streams.has(id));
      if (connected.length === 0) return 0;
      const allowed = await authorize(connected);
      const id = ++this.seq;
      const timestamp = this.now().toISOString();
      let written = 0;
      for (const userId of connected) {
        const data = allowed.get(userId);
        if (!data) continue;
        const envelope = {
          type: event.type,
          schema_version: SCHEMA_VERSION,
          tenant_id: event.tenantId,
          ...(event.conversationId ? { conversation_id: event.conversationId } : {}),
          actor_id: event.actorId,
          timestamp,
          data,
        };
        const frame = sseFrame(id, event.type, envelope);
        for (const sink of [...(this.streams.get(userId) ?? [])]) {
          // Втора линия: поток на друг клиент никога не получава събитието, каквото и да върне authorize.
          if (sink.tenantId !== event.tenantId) continue;
          try {
            sink.write(frame);
            written += 1;
          } catch (err) {
            this.onError(err);
            this.drop(sink);
          }
        }
      }
      return written;
    };
    const result = this.queue.then(run);
    // Грешка в едно събитие не спира опашката; викащият я получава в своя Promise.
    this.queue = result.catch((err: unknown) => this.onError(err));
    const observe = this.onPublished;
    if (observe) {
      const seconds = () => (performance.now() - queuedAt) / 1000;
      result.then(
        (written) => observe(event.type, written > 0 ? 'delivered' : 'no_recipients', seconds()),
        () => observe(event.type, 'error', seconds()),
      );
    }
    return result;
  }

  /** Изход, деактивиране, отнети сесии (AC-16): всички потоци на човека се затварят веднага. */
  disconnectUser(userId: string): number {
    const set = this.streams.get(userId);
    if (!set) return 0;
    const sinks = [...set];
    for (const sink of sinks) this.drop(sink);
    return sinks.length;
  }

  /** Отнета една сесия (изход от едно устройство) — само нейните потоци. */
  disconnectSession(sessionId: string): number {
    let closed = 0;
    for (const set of [...this.streams.values()]) {
      for (const sink of [...set]) {
        if (sink.sessionId !== sessionId) continue;
        this.drop(sink);
        closed += 1;
      }
    }
    return closed;
  }

  /** Спиране на процеса: потоците се затварят, за да може HTTP сървърът да спре. */
  closeAll(): void {
    for (const set of [...this.streams.values()]) {
      for (const sink of [...set]) this.drop(sink);
    }
  }
}
