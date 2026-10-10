import type { Redis } from 'ioredis';
import { CLUSTER_CHANNEL, type ClusterTransport } from './cluster.js';

/**
 * Pub/sub между инстанциите през Redis: `pub` е общата командна връзка, `sub` — отделна (в режим
 * абонат връзката не изпълнява други команди). Затварянето на връзките е на собственика им.
 */
export class RedisTransport implements ClusterTransport {
  private listener: ((channel: string, message: string) => void) | null = null;

  constructor(
    private readonly pub: Redis,
    private readonly sub: Redis,
    private readonly channel = CLUSTER_CHANNEL,
  ) {}

  async publish(message: string): Promise<void> {
    await this.pub.publish(this.channel, message);
  }

  async subscribe(onMessage: (message: string) => void): Promise<void> {
    this.listener = (channel, message) => {
      if (channel === this.channel) onMessage(message);
    };
    this.sub.on('message', this.listener);
    await this.sub.subscribe(this.channel);
  }

  async close(): Promise<void> {
    if (this.listener) this.sub.off('message', this.listener);
    this.listener = null;
    await this.sub.unsubscribe(this.channel).catch(() => undefined);
  }
}
