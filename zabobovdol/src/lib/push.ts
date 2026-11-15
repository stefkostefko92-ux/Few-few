import "server-only";
import { prisma } from "@/lib/prisma";
import { sendOnce, outageNotice, postNotice, scamNotice, type Notice } from "@/lib/push-notify-core";

// Известия (web push) по теми. Човек избира темите сам; нищо не се праща без
// изричен абонамент. Изпращането (VAPID + криптиране) е в `push-send.ts`; тук е
// договорът и логиката „прати ВЕДНЪЖ при публикуване“ (чистата част е в
// `push-notify-core.ts`).

export const PUSH_TOPICS = {
  outages: "Спиране на ток и вода",
  scams: "Предупреждения за измами",
  news: "Новини от общината",
  pharmacy: "Дежурна аптека днес",
} as const;
export type PushTopic = keyof typeof PUSH_TOPICS;

export function isPushTopic(x: unknown): x is PushTopic {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(PUSH_TOPICS, x);
}

export type PushPayload = { title: string; body: string; url: string };
export type PushResult = { configured: boolean; sent: number; failed: number };

// Праща до всички абонати на темата. Реализацията се зарежда мързеливо, за да
// не тегли криптографията във всяка страница.
export async function notifyTopic(topic: PushTopic, payload: PushPayload): Promise<PushResult> {
  try {
    const mod = (await import("@/lib/push-send")) as {
      sendToTopic?: (t: PushTopic, p: PushPayload) => Promise<PushResult>;
    };
    if (typeof mod.sendToTopic !== "function") return { configured: false, sent: 0, failed: 0 };
    return await mod.sendToTopic(topic, payload);
  } catch {
    return { configured: false, sent: 0, failed: 0 };
  }
}

const send = (n: Notice) => notifyTopic(n.topic, n.payload);

// Вика се от админ панела след запис/публикуване. Праща известие САМО за
// публикуван запис, който още не е известяван (notifiedAt е празно). Записът
// първо се „заявява“ атомарно (updateMany … notifiedAt: null), така че две
// едновременни извиквания не пращат двойно. Ако известията не са настроени на
// сървъра, заявката се връща (notifiedAt = null) — иначе по-късно включване не
// би известило за нищо.
export async function notifyOnPublish(model: string, id: string): Promise<void> {
  const claimWhere = { id, published: true, notifiedAt: null };
  if (model === "outage") {
    await sendOnce({
      load: async () => outageNotice(await prisma.outage.findUnique({ where: { id } })),
      claim: async (at) =>
        (await prisma.outage.updateMany({ where: claimWhere, data: { notifiedAt: at } })).count === 1,
      send,
      release: async (at) => {
        await prisma.outage.updateMany({ where: { id, notifiedAt: at }, data: { notifiedAt: null } });
      },
    });
    return;
  }
  if (model === "scamAlert") {
    await sendOnce({
      load: async () => scamNotice(await prisma.scamAlert.findUnique({ where: { id } })),
      claim: async (at) =>
        (await prisma.scamAlert.updateMany({ where: claimWhere, data: { notifiedAt: at } })).count === 1,
      send,
      release: async (at) => {
        await prisma.scamAlert.updateMany({ where: { id, notifiedAt: at }, data: { notifiedAt: null } });
      },
    });
    return;
  }
  if (model === "post") {
    await sendOnce({
      load: async () => postNotice(await prisma.post.findUnique({ where: { id } })),
      claim: async (at) =>
        (await prisma.post.updateMany({ where: claimWhere, data: { notifiedAt: at } })).count === 1,
      send,
      release: async (at) => {
        await prisma.post.updateMany({ where: { id, notifiedAt: at }, data: { notifiedAt: null } });
      },
    });
  }
}
