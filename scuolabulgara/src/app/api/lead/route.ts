import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notifyNewLead } from "@/lib/mailer";
import { clientIp, createRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

// The form is public and every submission writes a row and sends an email, so
// cap it per IP: enough for a genuine enquiry (even a corrected re-send),
// far too little to flood the database or use us to spam the admin's inbox.
const limit = createRateLimit({ windowMs: 10 * 60 * 1000, max: 5 });

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (limit.isLimited(ip)) {
    return NextResponse.json({ ok: false, error: "too_many_requests" }, { status: 429 });
  }
  try {
    const body = await req.json();
    const name = String(body.name || "").trim().slice(0, 120);
    const email = String(body.email || "").trim().slice(0, 160);
    const message = String(body.message || "").trim().slice(0, 4000);
    const topic = String(body.topic || "").slice(0, 160);
    const locale = ["it", "bg", "en"].includes(body.locale) ? body.locale : "it";

    if (!name || !email || !message || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    // Only successful submissions count, so a mistyped email doesn't lock
    // a genuine visitor out (invalid input is rejected above without any work).
    limit.record(ip);
    await prisma.lead.create({ data: { name, email, message, topic, locale } });
    // Best-effort email notification; never block the response on it.
    notifyNewLead({ name, email, topic, message, locale }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
