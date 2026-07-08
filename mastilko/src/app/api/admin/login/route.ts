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

// Прост in-memory rate limit срещу brute force (5 опита/мин/IP).
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 2000) hits.clear();
  return list.length > 5;
}

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
  const dummy = "$2a$10$0000000000000000000000000000000000000000000000000000";
  const ok = await bcrypt.compare(body.pass, hash ?? dummy);
  if (!hash || !ok) {
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
