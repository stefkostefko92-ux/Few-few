import { NextResponse } from "next/server";
import { z } from "zod";

import { appendAudit } from "@/lib/audit";
import { clientIpOptionsFromEnv, pickClientIp } from "@/lib/client-ip";
import { isInvestigationMode } from "@/lib/mode";
import { RateLimiter } from "@/lib/rate-limit";
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

/**
 * Спирачка срещу подбор на парола.
 *
 * Две кофи, защото двете атаки са различни: една парола срещу много
 * идентификатора (password spraying) се вижда само по адреса, а много пароли
 * срещу един идентификатор — само по него. Едната кофа сама пропуска другата.
 *
 * Броят е нарочно нисък: човек, който помни паролата си, не бърка пет пъти за
 * четвърт час, а инсталацията е на едно РПУ, не публичен сайт.
 */
const perIdentifier = new RateLimiter(5, 15 * 60_000);
const perAddress = new RateLimiter(20, 15 * 60_000);

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
  const addressKey = client?.ip.normalized ?? "unknown";

  const byIdentifier = perIdentifier.check(parsed.data.id.trim());
  const byAddress = perAddress.check(addressKey);
  if (!byIdentifier.allowed || !byAddress.allowed) {
    const retryAfter = Math.max(byIdentifier.retryAfterSeconds, byAddress.retryAfterSeconds);
    // Отказът също се вписва: серия такива редове е самата следа от атаката.
    appendAudit({
      ts: new Date().toISOString(),
      actor: parsed.data.id.slice(0, 64),
      actorUnit: "—",
      actorRole: "—",
      action: "вход",
      justification: "спрян от ограничението за опити",
      query: "",
      sources: [],
      clientIp: client?.ip.normalized,
    });
    return NextResponse.json(
      { error: `Твърде много опити. Опитай пак след ${retryAfter} s.` },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

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

  // Успешният вход не бива да оставя човека наказан за по-раншна грешка.
  perIdentifier.forget(parsed.data.id.trim());

  const response = NextResponse.json({ ok: true, name: user.name, role: user.role });
  const token = await issueToken({ sub: user.id, unit: user.unit, role: user.role }, secret);
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    // СТРОГА, не „lax": справката е GET със странични ефекти (тръгват заявки
    // навън и се пише одиторски запис). При „lax" подхвърлена връзка от чужд
    // сайт би носила бисквитката при навигация — тоест би накарала служител да
    // изтече заявка и да остави запис на свое име и по своята преписка.
    sameSite: "strict",
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
