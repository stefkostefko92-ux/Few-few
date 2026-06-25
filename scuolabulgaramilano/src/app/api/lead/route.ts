import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notifyNewLead } from "@/lib/mailer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
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
    await prisma.lead.create({ data: { name, email, message, topic, locale } });
    // Best-effort email notification; never block the response on it.
    notifyNewLead({ name, email, topic, message, locale }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
