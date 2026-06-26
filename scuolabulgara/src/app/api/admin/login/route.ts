import { NextRequest, NextResponse } from "next/server";
import { createSession, sessionCookieOptions, verifyCredentials, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// Simple in-memory rate limit (per IP): blocks after too many failed attempts.
// Sufficient for a single-instance self-hosted deployment.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 8;
const attempts = new Map<string, { count: number; first: number }>();

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function isBlocked(ip: string): boolean {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW_MS) { attempts.delete(ip); return false; }
  return a.count >= MAX_FAILS;
}

function recordFail(ip: string) {
  // Opportunistically drop expired entries so rotating-IP floods can't grow the
  // map without bound (single-instance, so a periodic sweep here is enough).
  if (attempts.size > 1000) {
    const now = Date.now();
    for (const [k, v] of attempts) if (now - v.first > WINDOW_MS) attempts.delete(k);
  }
  const a = attempts.get(ip);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(ip, { count: 1, first: Date.now() });
  else a.count += 1;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (isBlocked(ip)) {
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
      recordFail(ip);
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    attempts.delete(ip);
    const token = await createSession(email.toLowerCase());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
