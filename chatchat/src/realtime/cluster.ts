import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/**
 * Няколко инстанции на API-то (NFR-06, NFR-11): хъбовете си говорят през Redis pub/sub (един канал —
 * редът на съобщенията от една инстанция се пази). Три вида съобщения:
 *  - присъствие на потоците (`up`/`down`/`snap`/`hello`/`bye`): кои потребители имат отворен поток
 *    в коя инстанция — само id-та на хора, без нищо друго. Снимка на всеки heartbeat (25 s);
 *    инстанция без снимка 3 heartbeat-а е мъртва и се забравя;
 *  - `event`: събитие, ВЕЧЕ минало през authorize в инстанцията-източник В МОМЕНТА на изпращане
 *    (текущите роля/активност/членство от базата) — носи данните ПО ПОЛУЧАТЕЛ; приемащата инстанция
 *    пише всяко парче САМО в потоците на същия човек и само ако потокът е от същия клиент;
 *  - `revoke`: отнети сесии (`onSessionsRevoked`) — всяка инстанция затваря своите потоци веднага.
 * Входящото е проверено със zod (Redis е във вътрешната мрежа, но се третира като недоверен вход).
 */

export const CLUSTER_CHANNEL = 'chatchat:rt';
const VERSION = 1;

const Id = z.string().min(1).max(64);

const Message = z.discriminatedUnion('t', [
  z.object({ v: z.literal(VERSION), t: z.literal('up'), i: Id, u: Id }),
  z.object({ v: z.literal(VERSION), t: z.literal('down'), i: Id, u: Id }),
  z.object({ v: z.literal(VERSION), t: z.literal('snap'), i: Id, users: z.array(Id).max(100_000) }),
  z.object({ v: z.literal(VERSION), t: z.literal('hello'), i: Id }),
  z.object({ v: z.literal(VERSION), t: z.literal('bye'), i: Id }),
  z.object({
    v: z.literal(VERSION),
    t: z.literal('revoke'),
    i: Id,
    sessionId: Id.optional(),
    userIds: z.array(Id).max(10_000),
  }),
  z.object({
    v: z.literal(VERSION),
    t: z.literal('event'),
    i: Id,
    type: z.string().min(1).max(40),
    tenantId: Id,
    conversationId: Id.nullable().optional(),
    actorId: Id.nullable(),
    timestamp: z.string().max(40),
    recipients: z.array(z.tuple([Id, z.record(z.string(), z.unknown())])).max(10_000),
  }),
]);

export type ClusterMessage = z.infer<typeof Message>;
export type RemoteEvent = Extract<ClusterMessage, { t: 'event' }>;
export type RemoteRevoke = Extract<ClusterMessage, { t: 'revoke' }>;

/** Транспортът: Redis pub/sub в продукция, общ брокер в паметта в тестовете. */
export interface ClusterTransport {
  publish(message: string): Promise<void>;
  /** Абонира се; обработчикът получава суровия низ. */
  subscribe(onMessage: (message: string) => void): Promise<void>;
  close(): Promise<void>;
}

/** Каквото кластерът иска от хъба (без кръгова зависимост). */
export interface ClusterHost {
  localUsers(): string[];
  deliverRemote(event: RemoteEvent): void;
  revokeLocal(event: { sessionId?: string; userIds: readonly string[] }): void;
}

export interface ClusterOptions {
  /** През колко ms се праща снимка на свързаните (= heartbeat на хъба). */
  snapshotMs?: number;
  now?: () => number;
  onError?: (err: unknown) => void;
  /** Наблюдаемост: посока и вид на съобщението (без съдържание). */
  onMessage?: (direction: 'in' | 'out', kind: ClusterMessage['t'] | 'invalid') => void;
}

export class RealtimeCluster {
  readonly instanceId = randomUUID();
  private readonly remote = new Map<string, { users: Set<string>; seenAt: number }>();
  private host: ClusterHost | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly snapshotMs: number;
  private readonly now: () => number;

  constructor(
    private readonly transport: ClusterTransport,
    private readonly opts: ClusterOptions = {},
  ) {
    this.snapshotMs = opts.snapshotMs ?? 25_000;
    this.now = opts.now ?? Date.now;
  }

  async start(host: ClusterHost): Promise<void> {
    this.host = host;
    await this.transport.subscribe((raw) => this.receive(raw));
    this.send({ v: VERSION, t: 'hello', i: this.instanceId });
    this.snapshot();
    this.timer = setInterval(() => {
      this.prune();
      this.snapshot();
    }, this.snapshotMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.send({ v: VERSION, t: 'bye', i: this.instanceId });
    await this.transport.close();
  }

  /** Свързан ли е човекът в ДРУГА инстанция (по последното известно). */
  hasRemote(userId: string): boolean {
    for (const peer of this.remote.values()) if (peer.users.has(userId)) return true;
    return false;
  }

  /** Броят на хората с поток в други инстанции (за „има ли изобщо слушатели“). */
  remoteUsers(): number {
    let n = 0;
    for (const peer of this.remote.values()) n += peer.users.size;
    return n;
  }

  up(userId: string): void {
    this.send({ v: VERSION, t: 'up', i: this.instanceId, u: userId });
  }

  down(userId: string): void {
    this.send({ v: VERSION, t: 'down', i: this.instanceId, u: userId });
  }

  forward(event: Omit<RemoteEvent, 'v' | 't' | 'i'>): void {
    this.send({ v: VERSION, t: 'event', i: this.instanceId, ...event });
  }

  revoke(event: { sessionId?: string; userIds: readonly string[] }): void {
    this.send({
      v: VERSION,
      t: 'revoke',
      i: this.instanceId,
      ...(event.sessionId ? { sessionId: event.sessionId } : {}),
      userIds: [...event.userIds],
    });
  }

  private snapshot(): void {
    if (!this.host) return;
    this.send({ v: VERSION, t: 'snap', i: this.instanceId, users: this.host.localUsers() });
  }

  /** Инстанция без снимка 3 интервала е мъртва (срив без `bye`) — хората ѝ не са свързани. */
  private prune(): void {
    const floor = this.now() - 3 * this.snapshotMs;
    for (const [id, peer] of this.remote) if (peer.seenAt < floor) this.remote.delete(id);
  }

  private peer(id: string) {
    let p = this.remote.get(id);
    if (!p) {
      p = { users: new Set(), seenAt: this.now() };
      this.remote.set(id, p);
    }
    p.seenAt = this.now();
    return p;
  }

  private send(message: ClusterMessage): void {
    this.opts.onMessage?.('out', message.t);
    this.transport
      .publish(JSON.stringify(message))
      .catch((err: unknown) => this.opts.onError?.(err));
  }

  private receive(raw: string): void {
    let message: ClusterMessage;
    try {
      const parsed = Message.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        this.opts.onMessage?.('in', 'invalid');
        return;
      }
      message = parsed.data;
    } catch {
      this.opts.onMessage?.('in', 'invalid');
      return;
    }
    if (message.i === this.instanceId) return;
    this.opts.onMessage?.('in', message.t);
    try {
      this.apply(message);
    } catch (err) {
      this.opts.onError?.(err);
    }
  }

  private apply(m: ClusterMessage): void {
    switch (m.t) {
      case 'up':
        this.peer(m.i).users.add(m.u);
        return;
      case 'down':
        this.peer(m.i).users.delete(m.u);
        return;
      case 'snap':
        this.peer(m.i).users = new Set(m.users);
        return;
      case 'hello':
        this.peer(m.i);
        this.snapshot();
        return;
      case 'bye':
        this.remote.delete(m.i);
        return;
      case 'revoke':
        this.host?.revokeLocal({
          ...(m.sessionId ? { sessionId: m.sessionId } : {}),
          userIds: m.userIds,
        });
        return;
      case 'event':
        this.host?.deliverRemote(m);
        return;
    }
  }
}

/** Брокер в паметта: няколко „инстанции“ в един процес (тестовете на хъба). */
export class MemoryBroker {
  private readonly handlers = new Set<(m: string) => void>();

  transport(): ClusterTransport {
    let mine: ((m: string) => void) | null = null;
    return {
      publish: async (message) => {
        for (const h of [...this.handlers]) queueMicrotask(() => h(message));
      },
      subscribe: async (onMessage) => {
        mine = onMessage;
        this.handlers.add(onMessage);
      },
      close: async () => {
        if (mine) this.handlers.delete(mine);
      },
    };
  }
}
