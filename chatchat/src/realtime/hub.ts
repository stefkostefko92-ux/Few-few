import type { RealtimeCluster, RemoteEvent } from './cluster.js';
import {
  SCHEMA_VERSION,
  sseFrame,
  type Authorizer,
  type HubOptions,
  type PublishResult,
  type RealtimeEvent,
  type RealtimeEventType,
  type Recipients,
  type StreamSink,
} from './types.js';

export {
  SCHEMA_VERSION,
  sseFrame,
  type Authorizer,
  type HubOptions,
  type PublishResult,
  type RealtimeEvent,
  type RealtimeEventType,
  type Recipients,
  type StreamSink,
};

/**
 * Хъбът за реално време (§13.3 „договор за сигурност realtime“, NFR-11): отворените SSE потоци
 * на процеса, подредени по потребител. С няколко инстанции (NFR-06) хъбовете си говорят през
 * Redis pub/sub (`cluster.ts`): кой е свързан къде, събития и отнети сесии. Без кластер (без
 * REDIS_URL) хъбът е само в процеса — тогава работи САМО една инстанция.
 *
 * Сигурността: хъбът НЕ знае правилата за достъп. Всяко събитие идва с `authorize`, който се вика
 * В МОМЕНТА на изпращане за свързаните получатели (в КОЯТО И ДА Е инстанция) и връща какво точно
 * вижда всеки (по текущите му права — членството се проверява наново). Получател извън резултата не
 * получава нищо; към другите инстанции отиват САМО authorize-натите данни, по получател, и там се
 * пишат само в потоците на същия човек от същия клиент. Никога payload без authorize.
 * Събитията се обработват едно след друго — редът на изпращане е редът на публикуване.
 */

export class RealtimeHub {
  private seq = 0;
  private readonly streams = new Map<string, Set<StreamSink>>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly maxStreams: number;
  private readonly now: () => Date;
  private readonly onError: (err: unknown) => void;
  private readonly onPublished: HubOptions['onPublished'];
  private readonly onRemoteDelivered: HubOptions['onRemoteDelivered'];
  private cluster: RealtimeCluster | null = null;
  readonly heartbeatMs: number;

  constructor(opts: HubOptions = {}) {
    this.maxStreams = opts.maxStreamsPerUser ?? 5;
    this.heartbeatMs = opts.heartbeatMs ?? 25_000;
    this.now = opts.now ?? (() => new Date());
    this.onError = opts.onError ?? (() => undefined);
    this.onPublished = opts.onPublished;
    this.onRemoteDelivered = opts.onRemoteDelivered;
  }

  /**
   * Свързва хъба с другите инстанции (Redis pub/sub). След това `size()` и получателите на
   * събитията включват и хората, свързани другаде; `revoke` затваря потоците навсякъде.
   */
  async joinCluster(cluster: RealtimeCluster): Promise<void> {
    this.cluster = cluster;
    await cluster.start({
      localUsers: () => [...this.streams.keys()],
      deliverRemote: (event) => this.deliverRemote(event),
      revokeLocal: (event) => this.revokeLocal(event),
    });
  }

  /** Записва потока; връща функцията за отписване (при затваряне на връзката). */
  attach(sink: StreamSink): () => void {
    const set = this.streams.get(sink.userId) ?? new Set<StreamSink>();
    if (set.size === 0) this.cluster?.up(sink.userId);
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
    if (set.size === 0) {
      this.streams.delete(sink.userId);
      this.cluster?.down(sink.userId);
    }
  }

  private drop(sink: StreamSink): void {
    this.detach(sink);
    try {
      sink.end();
    } catch (err) {
      this.onError(err);
    }
  }

  /**
   * Има ли слушатели (за човека или изобщо) — заедно с другите инстанции: публикуващите го питат,
   * преди да изчислят получателите. Броят на ПОТОЦИТЕ в процеса (метриката) е `localSize`.
   */
  size(userId?: string): number {
    const cluster = this.cluster;
    let remote = 0;
    if (cluster) remote = userId ? Number(cluster.hasRemote(userId)) : cluster.remoteUsers();
    return this.localSize(userId) + remote;
  }

  /** Отворените потоци в ТОЗИ процес (за човека или общо). */
  localSize(userId?: string): number {
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
      const cluster = this.cluster;
      if (this.streams.size === 0 && (!cluster || cluster.remoteUsers() === 0)) return 0;
      const list = typeof recipients === 'function' ? await recipients() : recipients;
      const connected = [...new Set(list)].filter(
        (id) => this.streams.has(id) || cluster?.hasRemote(id) === true,
      );
      if (connected.length === 0) return 0;
      const allowed = await authorize(connected);
      const id = ++this.seq;
      const timestamp = this.now().toISOString();
      let written = 0;
      for (const userId of connected) {
        const data = allowed.get(userId);
        if (data) written += this.write(id, event, userId, data, timestamp);
      }
      // Другите инстанции: само authorize-натите данни, по получател (никога суровото събитие).
      const remote: Array<[string, Record<string, unknown>]> = [];
      for (const userId of connected) {
        const data = allowed.get(userId);
        if (data && cluster?.hasRemote(userId)) remote.push([userId, data]);
      }
      if (cluster && remote.length > 0) {
        cluster.forward({
          type: event.type,
          tenantId: event.tenantId,
          conversationId: event.conversationId ?? null,
          actorId: event.actorId,
          timestamp,
          recipients: remote,
        });
      }
      return written + remote.length;
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

  /** Рамка до потоците на един човек от клиента на събитието; връща колко потока я получиха. */
  private write(
    id: number,
    event: Pick<RealtimeEvent, 'type' | 'tenantId' | 'conversationId' | 'actorId'>,
    userId: string,
    data: Record<string, unknown>,
    timestamp: string,
  ): number {
    const sinks = this.streams.get(userId);
    if (!sinks || sinks.size === 0) return 0;
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
    let written = 0;
    for (const sink of [...sinks]) {
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
    return written;
  }

  /** Събитие от друга инстанция: вече authorize-нато там — всяко парче само до своя човек. */
  private deliverRemote(event: RemoteEvent): void {
    const id = ++this.seq;
    let written = 0;
    for (const [userId, data] of event.recipients) {
      const local = { ...event, type: event.type as RealtimeEventType };
      written += this.write(id, local, userId, data, event.timestamp);
    }
    if (written > 0) {
      const at = Date.parse(event.timestamp);
      const seconds = Number.isFinite(at) ? Math.max(0, (this.now().getTime() - at) / 1000) : 0;
      this.onRemoteDelivered?.(event.type, seconds);
    }
  }

  /** Отнети сесии тук (от кука или от друга инстанция). */
  private revokeLocal(event: { sessionId?: string; userIds: readonly string[] }): void {
    if (event.sessionId) this.disconnectSession(event.sessionId);
    else for (const userId of event.userIds) this.disconnectUser(userId);
  }

  /** Отнети сесии (`onSessionsRevoked`, AC-16): потоците се затварят тук И във всички инстанции. */
  revoke(event: { sessionId?: string; userIds: readonly string[] }): void {
    this.revokeLocal(event);
    this.cluster?.revoke(event);
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
