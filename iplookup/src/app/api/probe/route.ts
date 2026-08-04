import { NextResponse } from "next/server";
import { z } from "zod";

import { clientIpOptionsFromEnv, pickClientIp } from "@/lib/client-ip";
import { isGloballyRoutable, parseIp } from "@/lib/ip";
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
  return NextResponse.json(result, {
    // Резултатът е моментна снимка — кеширането му би подвело потребителя.
    headers: { "cache-control": "no-store" },
  });
}
