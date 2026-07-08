import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ADMIN_COOKIE, COOKIE_MAX_AGE, createSession } from "@/lib/admin-auth";
import { readAdmins } from "@/lib/admin-store";

export const runtime = "nodejs";

const BodySchema = z.object({
  user: z.string().trim().min(1).max(60),
  pass: z.string().min(1).max(200),
});

// Rate limit срещу brute force: 5 опита/мин/IP + глобален предпазител
// (X-Forwarded-For е клиентски контролиран, затова само per-IP не стига).
const WINDOW_MS = 60_000;
const PER_IP_MAX = 5;
const GLOBAL_MAX = 60;
const hits = new Map<string, number[]>();
let globalHits: number[] = [];

function limited(ip: string): boolean {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < WINDOW_MS);
  if (globalHits.length >= GLOBAL_MAX) return true;
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  globalHits.push(now);
  hits.set(ip, list);
  if (hits.size > 2000) hits.clear();
  return list.length > PER_IP_MAX;
}

// Валиден 60-символен bcrypt hash за постоянно време при непознат потребител
// (малформиран hash би върнал compare веднага → timing oracle).
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limited(ip)) {
    return NextResponse.json(
      { error: "Прекалено много опити — изчакай минута." },
      { status: 429 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Невалидна заявка." }, { status: 400 });
  }

  const table = await readAdmins();
  const hash = table[body.user];
  // Сравняваме винаги (dummy hash при непознат потребител) → еднакво време.
  const ok = await bcrypt.compare(
    body.pass,
    typeof hash === "string" ? hash : DUMMY_HASH,
  );
  if (typeof hash !== "string" || !ok) {
    return NextResponse.json(
      { error: "Грешно име или парола." },
      { status: 401 },
    );
  }

  const token = await createSession(body.user);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
