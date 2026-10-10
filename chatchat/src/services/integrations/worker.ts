import { processDeliveries, type OutboxDeps } from './outbox.js';

/**
 * Фоновият изпращач към helpdesk (един на процес, като този на имейлите): на всеки `sweepSeconds`
 * — outbox-ът на порции, докато има зрели редове (най-много 50 порции по 20); веднъж на час — чистене на стария дневник
 * (доставени/пропуснати след `logDays`) и на отпечатъците на входящите известия (извън прозореца
 * за печата те и без това се отказват). Паралелни минавания не се застъпват; грешка не сваля процеса.
 */

const BATCH = 20;
const MAX_BATCHES = 50;
const PRUNE_EVERY_MS = 60 * 60 * 1000;

export async function pruneIntegrationLog(deps: OutboxDeps, now = new Date()): Promise<number> {
  const logCutoff = new Date(now.getTime() - deps.integrations.logDays * 86_400_000);
  const receiptCutoff = new Date(
    now.getTime() - 2 * deps.integrations.inboundToleranceSeconds * 1000 - 60_000,
  );
  const [log, receipts] = await Promise.all([
    deps.db.helpdeskDelivery.deleteMany({
      where: { status: { in: ['DELIVERED', 'SKIPPED'] }, updatedAt: { lt: logCutoff } },
    }),
    deps.db.helpdeskInboundReceipt.deleteMany({ where: { receivedAt: { lt: receiptCutoff } } }),
  ]);
  return log.count + receipts.count;
}

export class IntegrationWorker {
  private running: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastPrune = 0;

  constructor(
    private readonly deps: OutboxDeps,
    private readonly sweepSeconds: number,
  ) {}

  start(): void {
    void this.kick();
    if (this.sweepSeconds > 0 && this.timer === null) {
      this.timer = setInterval(() => void this.kick(), this.sweepSeconds * 1000);
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Едно минаване (връща обещание за тестовете). */
  kick(now?: Date): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run(now).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(now?: Date): Promise<void> {
    try {
      let delivered = 0;
      for (let i = 0; i < MAX_BATCHES; i += 1) {
        const report = await processDeliveries(this.deps, now ?? new Date(), BATCH);
        delivered += report.delivered;
        // Порцията взима само главата на всеки тикет — следващото събитие става зряло след нея.
        if (report.claimed === 0) break;
      }
      if (delivered > 0) this.deps.logger.info({ delivered }, 'доставки към helpdesk');
      const at = (now ?? new Date()).getTime();
      if (at - this.lastPrune >= PRUNE_EVERY_MS) {
        this.lastPrune = at;
        await pruneIntegrationLog(this.deps, now);
      }
    } catch (err) {
      this.deps.logger.warn(
        { errName: err instanceof Error ? err.name : 'unknown' },
        'изпращачът към helpdesk ще опита пак',
      );
    }
  }
}
