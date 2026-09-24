// MCP крайна точка (Streamable HTTP) — оттук ChatGPT и Claude ползват Мастилко
// като конектор: асистентът вика инструмент, ние връщаме готов линк към листа.
//
// Транспортът следва спецификацията на MCP за Streamable HTTP:
//   • един адрес, който приема POST и GET;
//   • POST с ЗАЯВКА → отговаряме с `application/json` (позволено е вместо SSE);
//   • POST с НОТИФИКАЦИЯ/отговор → 202 Accepted без тяло;
//   • GET и DELETE → 405, защото сървърът е БЕЗ СЕСИИ и няма поток за държане;
//   • `MCP-Protocol-Version` с непозната стойност → 400.
//
// ЗА ОРИГИНА (съзнателно отклонение, записано нарочно): спецификацията изисква
// проверка на `Origin` срещу DNS rebinding. Онзи модел на заплаха предполага
// сървър, до който БРАУЗЪРЪТ на жертвата стига, а нападателят — не (localhost
// или вътрешна мрежа), и който носи странична власт (бисквитка, сесия). Тук и
// двете липсват: адресът е публичен, всеки може да го извика директно, а
// маршрутът НЕ ЧЕТЕ бисквитки и не връща нищо, зависещо от потребителя —
// инструментите са чисти функции. Затова проверка на Origin не дава сигурност,
// а само би счупила браузърните MCP инспектори. Инвариантът, който пази това
// решение, е точно един: тук никога да не се чете бисквитка или сесия. Тръгне
// ли автентикация на тази точка, проверката на Origin става задължителна.

import { NextResponse, type NextRequest } from "next/server";
import { clientIp, pruneHits } from "@/lib/client-ip";
import {
  RPC,
  SUPPORTED_PROTOCOL,
  handleRpc,
  rpcError,
  type JsonRpcResponse,
} from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

/** Най-голямото тяло, което приемаме — инструментите работят с кратък текст. */
const MAX_BODY = 256 * 1024;

const WINDOW_MS = 60_000;
const PER_IP_MAX = 120;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= PER_IP_MAX) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 2000) pruneHits(hits, WINDOW_MS, now);
  return false;
}

/** Позволяваме всякакъв произход — виж бележката за Origin най-горе. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version, Accept, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS, "Cache-Control": "no-store" },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Няма SSE поток: сървърът е без сесии и не праща нищо по своя инициатива. */
export async function GET(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 405,
    headers: { ...CORS, Allow: "POST, OPTIONS" },
  });
}

/** Няма сесия за прекратяване. */
export async function DELETE(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 405,
    headers: { ...CORS, Allow: "POST, OPTIONS" },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (rateLimited(clientIp(req))) {
    return json(rpcError(null, RPC.INTERNAL, "Твърде много заявки. Опитай пак след минута."), 429);
  }

  // Версията на протокола се праща като хедър след договарянето. Непозната
  // стойност е 400 по спецификация; липсваща е допустима (първата заявка).
  const version = req.headers.get("mcp-protocol-version");
  if (version && !(SUPPORTED_PROTOCOL as readonly string[]).includes(version)) {
    return json(
      rpcError(null, RPC.INVALID_REQUEST, `Неподдържана версия на протокола: ${version}`, {
        supported: SUPPORTED_PROTOCOL,
      }),
      400,
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return json(rpcError(null, RPC.INVALID_REQUEST, "Заявката е твърде голяма."), 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json(rpcError(null, RPC.PARSE_ERROR, "Невалиден JSON."), 400);
  }

  // По-старите ревизии позволяваха пакет от съобщения в един масив. Приемаме
  // го — по-евтино е, отколкото да чупим клиент, който още го праща.
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return json(rpcError(null, RPC.INVALID_REQUEST, "Празен пакет."), 400);
    }
    const out = parsed
      .map((m) => handleRpc(m))
      .filter((r): r is JsonRpcResponse => r !== null);
    // Само нотификации → няма какво да върнем.
    return out.length === 0 ? new NextResponse(null, { status: 202, headers: CORS }) : json(out);
  }

  const response = handleRpc(parsed);
  if (response === null) {
    // Нотификация (например `notifications/initialized`) — приета, без тяло.
    return new NextResponse(null, { status: 202, headers: CORS });
  }
  // Съдържанието на заявката НЕ се логва: през тази точка минава текст, който
  // потребителят е написал в чата си (виж раздела за конектора в
  // /poveritelnost).
  return json(response);
}
