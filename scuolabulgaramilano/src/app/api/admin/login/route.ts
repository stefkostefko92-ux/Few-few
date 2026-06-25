import { NextRequest, NextResponse } from "next/server";
import { createSession, sessionCookieOptions, verifyCredentials, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let email = "";
  try {
    const body = await req.json();
    email = String(body.email || "").trim();
    const password = String(body.password || "");
    const ok = await verifyCredentials(email, password);

    // Best-effort audit log; never block login on logging errors.
    try {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
      await prisma.loginEvent.create({ data: { email: email.slice(0, 160), ok, ip } });
    } catch {}

    if (!ok) return NextResponse.json({ ok: false }, { status: 401 });

    const token = await createSession(email.toLowerCase());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
