/**
 * Договорът на реалното време (§13.3): типовете събития, обвивката, authorize и потокът. Отделно от
 * hub.ts, за да се ползва от кластера и рутерите без кръгови зависимости.
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
  /** Събитие от друга инстанция, записано тук: типът и секундите от публикуването при източника. */
  onRemoteDelivered?: (type: string, seconds: number) => void;
}

export type PublishResult = 'delivered' | 'no_recipients' | 'error';

/** Форматът на рамката (text/event-stream): монотонен `id`, тип и JSON на един ред. */
export function sseFrame(id: number, type: string, payload: unknown): string {
  return `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}
