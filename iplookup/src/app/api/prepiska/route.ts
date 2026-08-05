import { NextResponse } from "next/server";
import { z } from "zod";

import { CASE_COOKIE } from "@/lib/case-context";
import { isInvestigationMode } from "@/lib/mode";

/** Задава преписката за работната сесия. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  // Достатъчно дълго за „ДП 123/2026, чл. 159а НПК", но не за цял абзац.
  justification: z.string().trim().min(3).max(200),
});

export async function POST(request: Request) {
  if (!isInvestigationMode()) {
    return NextResponse.json({ error: "Не е приложимо в този режим." }, { status: 404 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Въведи номер на преписка и правно основание (поне 3 знака)." },
      { status: 400 },
    );
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CASE_COOKIE, parsed.data.justification, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CASE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
