import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ ok: false }, { status: 401 });
  const { id, handled } = await req.json();
  await prisma.lead.update({ where: { id: String(id) }, data: { handled: !!handled } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = await req.json();
  await prisma.lead.delete({ where: { id: String(id) } });
  return NextResponse.json({ ok: true });
}
