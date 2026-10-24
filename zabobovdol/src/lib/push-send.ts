import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import type { PushPayload, PushResult, PushTopic } from "@/lib/push";
import {
  buildPayload,
  classifyPushError,
  CONCURRENCY,
  nextAction,
  selectSubscribers,
  TTL_SECONDS,
  type SendOutcome,
} from "@/lib/push-core";

// Изпращане на известия (VAPID + криптиране по RFC 8291, чрез „web-push“).
// Без VAPID ключове на сървъра → configured:false и нищо не се пипа.
function vapid(): { pub: string; priv: string; subject: string } | null {
  const pub = (process.env.VAPID_PUBLIC_KEY ?? "").trim();
  const priv = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (process.env.VAPID_SUBJECT ?? "").trim();
  if (!pub || !priv || !/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { pub, priv, subject };
}

export function pushConfigured(): boolean {
  return vapid() !== null;
}

export async function sendToTopic(topic: PushTopic, payload: PushPayload): Promise<PushResult> {
  const v = vapid();
  if (!v) return { configured: false, sent: 0, failed: 0 };
  try {
    webpush.setVapidDetails(v.subject, v.pub, v.priv);
  } catch {
    return { configured: false, sent: 0, failed: 0 };
  }

  const candidates = await prisma.pushSubscription.findMany({ where: { topics: { contains: topic } } });
  const subs = selectSubscribers(candidates, topic);
  const body = buildPayload(payload);
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < subs.length; i += CONCURRENCY) {
    const batch = subs.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (s) => {
        let outcome: SendOutcome = "ok";
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            { TTL: TTL_SECONDS, urgency: "normal", timeout: 10_000 },
          );
        } catch (e) {
          outcome = classifyPushError((e as { statusCode?: number })?.statusCode);
        }
        const act = nextAction(outcome, s.failCount);
        try {
          if (act.kind === "ok") {
            sent++;
            await prisma.pushSubscription.update({
              where: { id: s.id },
              data: { lastOkAt: new Date(), failCount: 0 },
            });
          } else {
            failed++;
            if (act.kind === "delete") await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
            else await prisma.pushSubscription.update({ where: { id: s.id }, data: { failCount: act.failCount } });
          }
        } catch {
          /* записът на състоянието не бива да спира останалите */
        }
      }),
    );
  }
  return { configured: true, sent, failed };
}
