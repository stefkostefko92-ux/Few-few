import { NextRequest, NextResponse } from "next/server";
import { createSession, sessionCookieOptions, verifyCredentials, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clientIp, createRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

// Blocks an IP after too many FAILED attempts; a success clears the counter.
const limit = createRateLimit({ windowMs: 10 * 60 * 1000, max: 8 });

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (limit.isLimited(ip)) {
    return NextResponse.json({ ok: false, error: "too_many_attempts" }, { status: 429 });
  }

  let email = "";
  try {
    const body = await req.json();
    email = String(body.email || "").trim();
    const password = String(body.password || "");
    const ok = await verifyCredentials(email, password);

    // Best-effort audit log; never block login on logging errors.
    try {
      await prisma.loginEvent.create({ data: { email: email.slice(0, 160), ok, ip } });
    } catch {}

    if (!ok) {
      limit.record(ip);
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    limit.reset(ip);
    const token = await createSession(email.toLowerCase());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
