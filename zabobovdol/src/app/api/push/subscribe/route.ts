import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { PUSH_TOPICS } from "@/lib/push";
import { isBase64Url, isPushEndpoint, joinTopics } from "@/lib/push-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  subscription: z.object({
    endpoint: z.string().refine(isPushEndpoint, "Невалиден адрес."),
    keys: z.object({
      p256dh: z.string().refine((s) => isBase64Url(s, 20, 200)),
      auth: z.string().refine((s) => isBase64Url(s, 8, 64)),
    }),
  }),
  topics: z.array(z.enum(Object.keys(PUSH_TOPICS) as [string, ...string[]])).min(1).max(4),
});

// Записва абонамент: само адресът на услугата, ключовете и темите — без име,
// IP или друг идентификатор.
export async function POST(req: Request) {
  if (!rateLimit(await clientKey("push-sub"), 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Опитайте отново след малко." }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Невалидни данни." }, { status: 400 });
  const { subscription: s, topics } = parsed.data;
  const t = joinTopics(topics);
  await prisma.pushSubscription.upsert({
    where: { endpoint: s.endpoint },
    update: { p256dh: s.keys.p256dh, auth: s.keys.auth, topics: t, failCount: 0 },
    create: { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, topics: t },
  });
  return NextResponse.json({ ok: true });
}
