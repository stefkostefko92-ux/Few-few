import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { isPushEndpoint } from "@/lib/push-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ endpoint: z.string().refine(isPushEndpoint) });

export async function POST(req: Request) {
  if (!rateLimit(await clientKey("push-unsub"), 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Опитайте отново след малко." }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Невалидни данни." }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint } });
  return NextResponse.json({ ok: true });
}
