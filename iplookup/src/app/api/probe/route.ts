import { NextResponse } from "next/server";
import { z } from "zod";

import { clientIpOptionsFromEnv, pickClientIp } from "@/lib/client-ip";
import { isGloballyRoutable, parseIp } from "@/lib/ip";
import { appendAudit } from "@/lib/audit";
import { readCaseContext } from "@/lib/case-context";
import { capabilities, isInvestigationMode } from "@/lib/mode";
import { can, DENIED_MESSAGE } from "@/lib/permissions";
import { RateLimiter } from "@/lib/rate-limit";
import { probe } from "@/lib/sources/probe";

/**
 * Активната проверка се пуска САМО оттук — по изричен POST, не при рисуване на
 * страница. Този файл е спирачката пред единствената функция в продукта, която
 * отваря връзки навън.
 *
 * Нарочно е route handler, а не server action: така лимитът, методът и
 * заглавието `Retry-After` са явни и проверими.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Пет проверки на минута на посетител. Достатъчно за човек, който гледа
 * няколко адреса подред; безнадеждно малко за някой, който би искал да ползва
 * сървъра ни като скенер.
 */
const limiter = new RateLimiter(5, 60_000);

const Body = z.object({
  ip: z.string().min(2).max(64),
});

export async function POST(request: Request) {
  // Активната проверка отваря връзка към целта — тя вижда адреса на нашия
  // сървър. В следствен режим това демаскира разследването, затова е изключена
  // по подразбиране и се отключва само с изрично решение на органа.
  if (!capabilities().activeProbe) {
    return NextResponse.json(
      {
        error:
          "Активната проверка е изключена в този режим: тя се свързва с целта и издава проверката. Включва се с IPLOOKUP_ALLOW_PROBE=1.",
      },
      { status: 403 },
    );
  }

  // В следствен режим проверката е и действие по разследване: иска роля,
  // основание и запис в дневника. Тя е най-издайническото нещо тук — целта
  // вижда нашия адрес — затова не бива да е по-леко проверена от справката.
  const context = isInvestigationMode() ? await readCaseContext() : null;
  if (isInvestigationMode()) {
    if (!context) {
      return NextResponse.json(
        { error: "Няма задена преписка. Активна проверка без основание не се прави." },
        { status: 409 },
      );
    }
    if (!can(context.session.role, "probe")) {
      return NextResponse.json({ error: DENIED_MESSAGE }, { status: 403 });
    }
  }

  const options = clientIpOptionsFromEnv();
  const client = pickClientIp((name) => request.headers.get(name), options);
  // Няма ли разпознаваем адрес, всички такива заявки делят една кофа — по-добре
  // общ лимит, отколкото никакъв.
  const key = client?.ip.normalized ?? "unknown";

  const decision = limiter.check(key);
  if (!decision.allowed) {
    return NextResponse.json(
      {
        error: `Твърде много активни проверки. Опитай пак след ${decision.retryAfterSeconds} s.`,
      },
      { status: 429, headers: { "retry-after": String(decision.retryAfterSeconds) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Невалидно тяло на заявката." }, { status: 400 });
  }

  const parsedBody = Body.safeParse(payload);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Липсва адрес." }, { status: 400 });
  }

  const ip = parseIp(parsedBody.data.ip);
  if (!ip) {
    return NextResponse.json({ error: "Невалиден IP адрес." }, { status: 400 });
  }

  if (!isGloballyRoutable(ip)) {
    return NextResponse.json(
      {
        error:
          "Активна проверка се прави само на публично маршрутизируеми адреси. Частните и специалните диапазони са извън обхвата нарочно.",
      },
      { status: 422 },
    );
  }

  const result = await probe(ip);

  if (context) {
    appendAudit({
      ts: new Date().toISOString(),
      actor: context.session.sub,
      actorUnit: context.session.unit,
      actorRole: context.session.role,
      action: "активна-проверка",
      justification: context.justification,
      query: ip.normalized,
      // Записваме кои портове са отговорили: това е действието, което целта е
      // видяла, и то трябва да е възстановимо от дневника.
      sources: result.ports.filter((port) => port.state === "open").map((port) => `порт ${port.port}`),
      clientIp: client?.ip.normalized,
    });
  }

  return NextResponse.json(result, {
    // Резултатът е моментна снимка — кеширането му би подвело потребителя.
    headers: { "cache-control": "no-store" },
  });
}
