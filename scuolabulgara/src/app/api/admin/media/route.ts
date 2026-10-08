import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveImage, deleteUpload, isAllowedImage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ ok: false }, { status: 401 });
  const media = await prisma.media.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ ok: true, media });
}

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    const alt = String(form.get("alt") || "");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "no file" }, { status: 400 });
    if (!isAllowedImage(file.type)) return NextResponse.json({ ok: false, error: "type" }, { status: 415 });
    if (file.size > 12 * 1024 * 1024) return NextResponse.json({ ok: false, error: "too large" }, { status: 413 });

    const saved = await saveImage(file);
    const media = await prisma.media.create({
      data: { filename: saved.filename, url: saved.url, mime: saved.mime, size: saved.size, width: saved.width, height: saved.height, alt },
    });
    return NextResponse.json({ ok: true, media });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const { id } = await req.json();
    const m = await prisma.media.findUnique({ where: { id: String(id) } });
    if (!m) return NextResponse.json({ ok: false }, { status: 404 });
    await deleteUpload(m.filename);
    await prisma.media.delete({ where: { id: m.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
