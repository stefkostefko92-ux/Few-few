import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// Save a content section. Body: { key, it, bg, en, enabled? } where it/bg/en
// are plain objects (validated to be JSON-serialisable here).
export async function PUT(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body = await req.json();
    const key = String(body.key || "");
    if (!key) return NextResponse.json({ ok: false, error: "key" }, { status: 400 });

    const data: Record<string, unknown> = {};
    for (const loc of ["it", "bg", "en"] as const) {
      if (body[loc] && typeof body[loc] === "object") data[loc] = JSON.stringify(body[loc]);
    }
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;

    const updated = await prisma.content.update({ where: { key }, data });
    return NextResponse.json({ ok: true, updatedAt: updated.updatedAt });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
