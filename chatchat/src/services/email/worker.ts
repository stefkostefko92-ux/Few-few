import { processOutbox, scheduleDigests, type EmailDeps } from './outbox.js';

/**
 * Фоновият изпращач (един на процес, като семантичния индекс): на всеки `sweepSeconds` — дайджестите
 * за деня, после outbox-ът на порции, докато има зрели редове. Паралелни минавания не се
 * застъпват (`kick` чака текущото). Грешка не сваля процеса — логва се (без данни) и следващото
 * минаване опитва пак; изгубен наем (срив) прави реда отново достъпен.
 */

const BATCH = 20;
const MAX_BATCHES = 50;

export class EmailWorker {
  private running: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly deps: EmailDeps,
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
      await scheduleDigests(this.deps, now);
      let sent = 0;
      for (let i = 0; i < MAX_BATCHES; i += 1) {
        const report = await processOutbox(this.deps, now, BATCH);
        sent += report.sent;
        if (report.claimed < BATCH) break;
      }
      if (sent > 0) this.deps.logger.info({ sent }, 'имейл известия');
    } catch (err) {
      this.deps.logger.warn(
        { errName: err instanceof Error ? err.name : 'unknown' },
        'изпращачът на имейли ще опита пак',
      );
    }
  }
}
