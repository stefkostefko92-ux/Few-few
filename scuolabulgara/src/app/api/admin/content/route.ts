import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_CONTENT } from "@/lib/defaults";
import { isSectionKey } from "@/lib/cms";

export const runtime = "nodejs";

// Only rows the site knows about can be written — the editor can't conjure up
// arbitrary keys in the database.
const KNOWN_KEYS = new Set(DEFAULT_CONTENT.map((r) => r.key));
// Generous for text (the longest section, a legal page, is ~10 KB), but bounded
// so a runaway client can't bloat the SQLite file.
const MAX_LOCALE_BYTES = 256 * 1024;

// Save a content section. Body: { key, it?, bg?, en?, enabled? } where it/bg/en
// are plain objects.
export async function PUT(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body = await req.json();
    const key = String(body.key || "");
    if (!KNOWN_KEYS.has(key)) return NextResponse.json({ ok: false, error: "key" }, { status: 400 });

    const data: Record<string, unknown> = {};
    for (const loc of ["it", "bg", "en"] as const) {
      const v = body[loc];
      if (v === undefined) continue;
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        return NextResponse.json({ ok: false, error: "shape" }, { status: 400 });
      }
      const json = JSON.stringify(v);
      if (Buffer.byteLength(json, "utf8") > MAX_LOCALE_BYTES) {
        return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
      }
      data[loc] = json;
    }
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (Object.keys(data).length === 0) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });

    const updated = await prisma.content.update({ where: { key }, data });
    return NextResponse.json({ ok: true, updatedAt: updated.updatedAt });
  } catch {
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

// Reorder the page sections. Body: { sections: SectionKey[] } — the new order.
// Written in one transaction, so the page never sees a half-applied order.
export async function PATCH(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body = await req.json();
    const list: unknown = body.sections;
    if (!Array.isArray(list) || list.length === 0 || list.length > 50) {
      return NextResponse.json({ ok: false, error: "shape" }, { status: 400 });
    }
    const keys = list.map(String);
    if (!keys.every(isSectionKey) || new Set(keys).size !== keys.length) {
      return NextResponse.json({ ok: false, error: "keys" }, { status: 400 });
    }
    // Sections start at 2: 0 and 1 belong to settings and the hero, which stay first.
    await prisma.$transaction(
      keys.map((key, i) => prisma.content.update({ where: { key }, data: { order: i + 2 } })),
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
