// Цикълът на известията: на всеки ALERT_TICK_SECONDS проверява праговете и тагва ролите.
// Двойката (партида, правило) се „заявява“ в базата преди изпращането и се освобождава при провал —
// при срив между двете пингът се губи веднъж, вместо да се повтаря всяка минута.
import type { PrismaClient } from '@prisma/client';
import {
  inWindow,
  isDue,
  repeatDue,
  pairKey,
  planAlerts,
  type AlertGroup,
  type PendingItem,
} from '../domain/alerts.js';
import { buildAlertParts } from '../domain/messages.js';
import type { Logger } from '../log.js';
import { labelsOf, toBatchLike, toRuleLike } from './mapping.js';
import { getSettings } from './rules.js';

export interface AlertSender {
  // ping=false — съобщението споменава ролята, без да я тагва (тестът от дашборда).
  send(channelId: string, roleId: string, content: string, ping?: boolean): Promise<void>;
}

export interface TickResult {
  skipped?: 'busy' | 'window';
  sent: number;
  failed: number;
}

export interface NotifierDeps {
  db: PrismaClient;
  sender: AlertSender;
  log: Logger;
  now?: () => Date;
  retryAfterMs?: number;
}

export interface Notifier {
  tick(): Promise<TickResult>;
  start(intervalMs: number): void;
  stop(): void;
}

export function createNotifier(deps: NotifierDeps): Notifier {
  const now = deps.now ?? (() => new Date());
  const retryAfterMs = deps.retryAfterMs ?? 10 * 60_000;
  const backoff = new Map<string, number>();
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  // Групата е планирана от снимка в началото на цикъла, а изпращането на предните групи отнема
  // секунди: преди заявката партидите и правилата се четат наново (редактирани, изтрити, вече не
  // дължими отпадат), а пингва се само за двойките, които заявката наистина е взела: нова двойка —
  // вмъкнат ред; напомняне — ред, чийто час на последния таг още е същият (compare-and-set).
  async function sendGroup(
    group: AlertGroup,
    labels: Record<string, string>,
    at: Date,
  ): Promise<number> {
    const [batchRows, ruleRows] = await Promise.all([
      deps.db.batch.findMany({
        where: { id: { in: [...new Set(group.items.map((i) => i.batch.id))] } },
        include: { seedType: true },
      }),
      deps.db.alertRule.findMany({
        where: { id: { in: [...new Set(group.items.map((i) => i.rule.id))] }, enabled: true },
      }),
    ]);
    const batches = new Map(batchRows.map((b) => [b.id, toBatchLike(b)]));
    const rules = new Map(ruleRows.map((r) => [r.id, toRuleLike(r)]));
    const fresh: PendingItem[] = [];
    for (const item of group.items) {
      const batch = batches.get(item.batch.id);
      const rule = rules.get(item.rule.id);
      if (
        !batch ||
        !rule ||
        rule.channelId !== group.channelId ||
        rule.roleId !== group.roleId ||
        rule.message !== group.message
      ) {
        continue;
      }
      if (isDue(rule, batch, at)) fresh.push({ batch, rule });
    }
    if (fresh.length === 0) return 0;

    const pairOf = (i: PendingItem) => ({ batchId: i.batch.id, ruleId: i.rule.id });
    const existing = new Map(
      (
        await deps.db.notification.findMany({
          where: { OR: fresh.map(pairOf) },
          select: { batchId: true, ruleId: true, sentAt: true },
        })
      ).map((n) => [pairKey(n.batchId, n.ruleId), n.sentAt]),
    );
    const toCreate: PendingItem[] = [];
    const toRenew: Array<{ item: PendingItem; prev: Date }> = [];
    for (const item of fresh) {
      const prev = existing.get(pairKey(item.batch.id, item.rule.id));
      if (!prev) toCreate.push(item);
      else if (repeatDue(item.rule, prev, at)) toRenew.push({ item, prev });
    }

    const claimedKeys = new Set<string>();
    if (toCreate.length > 0) {
      const created = await deps.db.notification.createManyAndReturn({
        data: toCreate.map((i) => ({ ...pairOf(i), silent: false, sentAt: at })),
        skipDuplicates: true,
        select: { batchId: true, ruleId: true },
      });
      for (const c of created) claimedKeys.add(pairKey(c.batchId, c.ruleId));
    }
    const renewed = new Map<string, Date>();
    for (const { item, prev } of toRenew) {
      const { count } = await deps.db.notification.updateMany({
        where: { ...pairOf(item), sentAt: prev },
        data: { sentAt: at, silent: false },
      });
      if (count === 1) {
        claimedKeys.add(pairKey(item.batch.id, item.rule.id));
        renewed.set(pairKey(item.batch.id, item.rule.id), prev);
      }
    }
    const items = fresh.filter((i) => claimedKeys.has(pairKey(i.batch.id, i.rule.id)));
    if (items.length === 0) return 0;

    const parts = buildAlertParts({ ...group, items }, labels, at);
    for (const [index, part] of parts.entries()) {
      try {
        await deps.sender.send(group.channelId, group.roleId, part.content);
      } catch (err) {
        // Освобождават се само неизпратените части — изпратените не се пингват втори път. Новата
        // двойка се маха, а напомнянето връща предишния час (иначе следващото чака цял интервал).
        const unsent = new Set(parts.slice(index).flatMap((p) => p.batchIds));
        const release = items.filter((i) => unsent.has(i.batch.id));
        const firstTime = release.filter((i) => !renewed.has(pairKey(i.batch.id, i.rule.id)));
        if (firstTime.length > 0) {
          await deps.db.notification.deleteMany({ where: { OR: firstTime.map(pairOf) } });
        }
        for (const i of release) {
          const prev = renewed.get(pairKey(i.batch.id, i.rule.id));
          if (prev) {
            await deps.db.notification.updateMany({
              where: { ...pairOf(i), sentAt: at },
              data: { sentAt: prev },
            });
          }
        }
        throw err;
      }
    }
    return items.length;
  }

  async function runTick(): Promise<TickResult> {
    const at = now();
    const settings = await getSettings(deps.db);
    if (!inWindow(at, settings)) return { skipped: 'window', sent: 0, failed: 0 };

    const [types, batchRows, ruleRows, notified] = await Promise.all([
      deps.db.seedType.findMany(),
      deps.db.batch.findMany({ include: { seedType: true } }),
      deps.db.alertRule.findMany({ where: { enabled: true } }),
      deps.db.notification.findMany({ select: { batchId: true, ruleId: true, sentAt: true } }),
    ]);
    const groups = planAlerts(
      batchRows.map(toBatchLike),
      ruleRows.map(toRuleLike),
      new Map(notified.map((n) => [pairKey(n.batchId, n.ruleId), n.sentAt])),
      at,
    );
    const labels = labelsOf(types);
    const result: TickResult = { sent: 0, failed: 0 };
    for (const group of groups) {
      const key = `${group.channelId}:${group.roleId}`;
      if ((backoff.get(key) ?? 0) > at.getTime()) continue;
      try {
        result.sent += await sendGroup(group, labels, at);
        backoff.delete(key);
      } catch (err) {
        backoff.set(key, at.getTime() + retryAfterMs);
        result.failed += group.items.length;
        deps.log.warn(
          { err, channelId: group.channelId, roleId: group.roleId },
          'известието не можа да се изпрати; нов опит след паузата',
        );
      }
    }
    if (result.sent > 0) deps.log.info({ sent: result.sent }, 'изпратени известия');
    return result;
  }

  async function tick(): Promise<TickResult> {
    if (running) return { skipped: 'busy', sent: 0, failed: 0 };
    running = true;
    try {
      return await runTick();
    } finally {
      running = false;
    }
  }

  function safeTick() {
    tick().catch((err: unknown) => deps.log.error({ err }, 'цикълът на известията се провали'));
  }

  return {
    tick,
    start(intervalMs) {
      if (timer) return;
      safeTick();
      timer = setInterval(safeTick, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
