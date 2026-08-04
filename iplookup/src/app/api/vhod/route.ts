import { NextResponse } from "next/server";
import { z } from "zod";

import { appendAudit } from "@/lib/audit";
import { clientIpOptionsFromEnv, pickClientIp } from "@/lib/client-ip";
import { isInvestigationMode } from "@/lib/mode";
import { DEFAULT_SESSION_SECONDS, issueToken } from "@/lib/session";
import { authenticate } from "@/lib/users";

/**
 * Вход и изход за следственото издание.
 *
 * Всеки опит — успешен или не — влиза в дневника. Неуспешните са толкова
 * важни, колкото успешните: серия откази е сигнал за подбор на парола.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  id: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

const COOKIE = "carbonip_session";

export async function POST(request: Request) {
  if (!isInvestigationMode()) {
    return NextResponse.json({ error: "Не е приложимо в този режим." }, { status: 404 });
  }

  const secret = process.env.IPLOOKUP_SESSION_SECRET?.trim();
  if (!secret) {
    // Без тайна жетоните биха били подправими. По-добре нула достъп.
    return NextResponse.json(
      { error: "Инсталацията не е довършена: липсва IPLOOKUP_SESSION_SECRET." },
      { status: 503 },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Липсват данни за вход." }, { status: 400 });
  }

  const client = pickClientIp((name) => request.headers.get(name), clientIpOptionsFromEnv());
  const user = authenticate(parsed.data.id, parsed.data.password);

  if (!user) {
    appendAudit({
      ts: new Date().toISOString(),
      actor: parsed.data.id.slice(0, 64),
      actorUnit: "—",
      actorRole: "—",
      action: "вход",
      justification: "неуспешен опит за вход",
      query: "",
      sources: [],
      clientIp: client?.ip.normalized,
    });
    // Едно и също съобщение за несъществуващ и за грешна парола.
    return NextResponse.json({ error: "Грешен идентификатор или парола." }, { status: 401 });
  }

  appendAudit({
    ts: new Date().toISOString(),
    actor: user.id,
    actorUnit: user.unit,
    actorRole: user.role,
    action: "вход",
    justification: "",
    query: "",
    sources: [],
    clientIp: client?.ip.normalized,
  });

  const response = NextResponse.json({ ok: true, name: user.name, role: user.role });
  const token = await issueToken({ sub: user.id, unit: user.unit, role: user.role }, secret);
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEFAULT_SESSION_SECONDS,
  });
  return response;
}

export async function DELETE(request: Request) {
  const client = pickClientIp((name) => request.headers.get(name), clientIpOptionsFromEnv());
  if (isInvestigationMode()) {
    appendAudit({
      ts: new Date().toISOString(),
      actor: "—",
      actorUnit: "—",
      actorRole: "—",
      action: "изход",
      justification: "",
      query: "",
      sources: [],
      clientIp: client?.ip.normalized,
    });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
