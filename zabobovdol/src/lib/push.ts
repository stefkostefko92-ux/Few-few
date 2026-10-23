import "server-only";
import { prisma } from "@/lib/prisma";

// Известия (web push) по теми. Човек избира темите сам; нищо не се праща без
// изричен абонамент. Изпращането (VAPID + криптиране) е в `push-send.ts`; тук е
// договорът и логиката „прати ВЕДНЪЖ при публикуване“.

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

const fmt = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("bg-BG", {
        timeZone: "Europe/Sofia",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d)
    : "";

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// Вика се от админ панела след запис/публикуване. Праща известие САМО за
// публикуван запис, който още не е известяван (notifiedAt е празно). Ако
// известията не са настроени на сървъра, нищо не се отбелязва — иначе по-късно
// включване не би известило за нищо, а и няма какво да се „дължи“.
export async function notifyOnPublish(model: string, id: string): Promise<void> {
  try {
    if (model === "outage") {
      const o = await prisma.outage.findUnique({ where: { id } });
      if (!o || !o.published || o.notifiedAt) return;
      // Не известяваме за вече минало прекъсване.
      if (o.endAt && o.endAt.getTime() < Date.now()) return;
      const what = o.utility === "WATER" ? "Спира водата" : "Спира токът";
      const when = o.startAt ? ` от ${fmt(o.startAt)}` : "";
      const r = await notifyTopic("outages", {
        title: `${what}${o.planned ? "" : " (авария)"}`,
        body: cut(`${o.area}${when}`, 180),
        url: `/prekysvaniya?s=push`,
      });
      if (r.configured) await prisma.outage.update({ where: { id }, data: { notifiedAt: new Date() } });
      return;
    }
    if (model === "scamAlert") {
      const a = await prisma.scamAlert.findUnique({ where: { id } });
      if (!a || !a.published || a.notifiedAt) return;
      const r = await notifyTopic("scams", {
        title: `Внимание: ${cut(a.title, 80)}`,
        body: cut(a.summary || "Нова измама в района. Прочетете как да се пазите.", 180),
        url: `/izmami?s=push`,
      });
      if (r.configured) await prisma.scamAlert.update({ where: { id }, data: { notifiedAt: new Date() } });
      return;
    }
    if (model === "post") {
      const p = await prisma.post.findUnique({ where: { id } });
      if (!p || !p.published || p.notifiedAt) return;
      const r = await notifyTopic("news", {
        title: cut(p.title, 90),
        body: cut(p.excerpt || p.source || "Нова новина", 180),
        url: `/novini/${p.slug}?s=push`,
      });
      if (r.configured) await prisma.post.update({ where: { id }, data: { notifiedAt: new Date() } });
    }
  } catch {
    /* известието е второстепенно — записът вече е направен */
  }
}
