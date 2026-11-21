// Чистата логика на „известие ВЕДНЪЖ при публикуване“ (без база и без мрежа) —
// тества се с node:test. Записът в базата и изпращането са в ./push.ts.

import { formatOutageTime, sofiaWallNow } from "@/lib/ingest-outages-core";
import type { PushTopicKey } from "@/lib/push-core";

export type NoticePayload = { title: string; body: string; url: string };
export type Notice = { topic: PushTopicKey; payload: NoticePayload };

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

type Base = { published: boolean; notifiedAt: Date | null };
export type OutageRow = Base & {
  utility: string;
  planned: boolean;
  area: string;
  startAt: Date | null;
  endAt: Date | null;
};
export type ScamRow = Base & { title: string; summary: string };
export type PostRow = Base & { title: string; excerpt: string; source: string; slug: string };

// startAt/endAt на прекъсванията са СТЕННО време на София в UTC полетата (виж
// ingest-outages-core.ts), затова „сега“ е sofiaWallNow(), не Date.now() — иначе
// спиране, свършило преди час-два, би изглеждало бъдещо (София е UTC+2/+3).
export function outageNotice(o: OutageRow | null, now: Date = new Date()): Notice | null {
  if (!o || !o.published || o.notifiedAt) return null;
  // Не известяваме за вече минало прекъсване.
  if (o.endAt && o.endAt.getTime() < sofiaWallNow(now).getTime()) return null;
  const what = o.utility === "WATER" ? "Спира водата" : "Спира токът";
  const when = o.startAt ? ` от ${formatOutageTime(o.startAt)}` : "";
  return {
    topic: "outages",
    payload: {
      title: `${what}${o.planned ? "" : " (авария)"}`,
      body: cut(`${o.area}${when}`, 180),
      url: "/prekysvaniya?s=push",
    },
  };
}

export function scamNotice(a: ScamRow | null): Notice | null {
  if (!a || !a.published || a.notifiedAt) return null;
  return {
    topic: "scams",
    payload: {
      title: `Внимание: ${cut(a.title, 80)}`,
      body: cut(a.summary || "Нова измама в района. Прочетете как да се пазите.", 180),
      url: "/izmami?s=push",
    },
  };
}

export function postNotice(p: PostRow | null): Notice | null {
  if (!p || !p.published || p.notifiedAt) return null;
  return {
    topic: "news",
    payload: {
      title: cut(p.title, 90),
      body: cut(p.excerpt || p.source || "Нова новина", 180),
      url: `/novini/${p.slug}?s=push`,
    },
  };
}

export type NotifySteps = {
  /** Чете записа и решава какво да се прати (null → нищо). */
  load: () => Promise<Notice | null>;
  /** Атомарно „заявява“ записа: notifiedAt null → at. true само ако е заявен от ТОЗИ извик. */
  claim: (at: Date) => Promise<boolean>;
  /** Праща до абонатите на темата. */
  send: (n: Notice) => Promise<{ configured: boolean }>;
  /** Връща notifiedAt на null (само ако още е `at` — не пипа чужда заявка). */
  release: (at: Date) => Promise<void>;
  now?: () => Date;
};

export type NotifyOutcome = "skipped" | "taken" | "sent" | "released";

// Заяви → прати → (при ненастроени известия) върни. Двама едновременни
// извикващи (двама админи, админ + вносът от ЕРМ) не могат да пратят двойно:
// само единият получава заявката. Ако известията не са настроени на сървъра
// (или изпращането се провали изцяло), заявката се връща, за да не „изгори“
// записът и по-късно включване да може да извести. Никога не хвърля.
export async function sendOnce(steps: NotifySteps): Promise<NotifyOutcome> {
  try {
    const notice = await steps.load();
    if (!notice) return "skipped";
    const at = steps.now ? steps.now() : new Date();
    if (!(await steps.claim(at))) return "taken";
    let configured = false;
    try {
      configured = (await steps.send(notice)).configured;
    } catch {
      configured = false;
    }
    if (configured) return "sent";
    try {
      await steps.release(at);
    } catch {
      /* остава заявен — по-добре без известие, отколкото двойно */
    }
    return "released";
  } catch {
    /* известието е второстепенно — записът вече е направен */
    return "skipped";
  }
}
