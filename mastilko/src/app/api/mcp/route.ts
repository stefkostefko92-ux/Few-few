// MCP крайна точка (Streamable HTTP) — оттук ChatGPT и Claude ползват Мастилко
// като конектор: асистентът вика инструмент, ние връщаме готов линк към листа.
//
// Транспортът обслужва ДВЕ епохи на протокола едновременно (виж `mcp/server.ts`):
// текущата 2026-07-28 (без ръкостискане, с `server/discover` и задължителни
// огледални хедъри) и наследените 2025-06-18 и по-стари, които ChatGPT и Claude
// говорят днес. Общото:
//   • един адрес, само POST;
//   • ЗАЯВКА → `application/json`; НОТИФИКАЦИЯ → 202 без тяло;
//   • GET и DELETE → 405 (няма сесии и няма поток за държане);
//   • `Mcp-Session-Id` и `Last-Event-ID` се пренебрегват нарочно.
//
// ЗА ОРИГИНА (съзнателно решение, записано нарочно): спецификацията изисква
// проверка на `Origin` срещу DNS rebinding и 403 при невалиден. Онзи модел на
// заплаха предполага сървър, до който БРАУЗЪРЪТ на жертвата стига, а
// нападателят — не (localhost, вътрешна мрежа), и който носи странична власт
// (бисквитка, сесия). Тук и двете липсват: адресът е публичен, всеки може да го
// извика директно, а маршрутът НЕ ЧЕТЕ бисквитки и не връща нищо, зависещо от
// потребителя — инструментите са чисти функции. Затова всеки произход е валиден
// за нас и 403 не се стига. Инвариантът, който пази това решение, е точно един:
// тук никога да не се чете бисквитка или сесия. Тръгне ли автентикация на тази
// точка, проверката на Origin става задължителна.

import { NextResponse, type NextRequest } from "next/server";
import { clientIp, pruneHits } from "@/lib/client-ip";
import {
  RPC,
  SUPPORTED_PROTOCOL,
  eraOf,
  handleRpc,
  metaVersion,
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
}

/**
 * Декодира стойност на хедър в sentinel формата `=?base64?…?=`.
 * Клиентът е длъжен да я ползва, когато стойността не е чист ASCII — а имената
 * на нашите инструменти са ASCII, така че това е за коректност, не за нужда.
 */
function decodeHeaderValue(v: string): string {
  const m = /^=\?base64\?(.*)\?=$/.exec(v);
  if (!m) return v;
  try {
    return Buffer.from(m[1]!, "base64").toString("utf8");
  } catch {
    return v;
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Няма SSE поток: сървърът е без сесии и не праща нищо по своя инициатива. */
export async function GET(): Promise<NextResponse> {
  return new NextResponse(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

/** Няма сесия за прекратяване. */
export async function DELETE(): Promise<NextResponse> {
  return new NextResponse(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (rateLimited(clientIp(req))) {
    return json(rpcError(null, RPC.INTERNAL, "Твърде много заявки. Опитай пак след минута."), 429);
  }

  const headerVersion = req.headers.get("mcp-protocol-version");
  if (headerVersion && !(SUPPORTED_PROTOCOL as readonly string[]).includes(headerVersion)) {
    return json(
      rpcError(null, RPC.UNSUPPORTED_PROTOCOL_VERSION, `Неподдържана версия на протокола: ${headerVersion}`, {
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
  // го — по-евтино е, отколкото да се счупи клиент, който още го праща.
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return json(rpcError(null, RPC.INVALID_REQUEST, "Празен пакет."), 400);
    }
    const out = parsed
      .map((m) => handleRpc(m, headerVersion).body)
      .filter((r): r is JsonRpcResponse => r !== null);
    return out.length === 0 ? new NextResponse(null, { status: 202, headers: CORS }) : json(out);
  }

  const id = (parsed as { id?: string | number | null })?.id ?? null;

  // Хедърите ОГЛЕДАЛО на тялото — задължителни от 2026-07-28. Смисълът им е, че
  // посредник (балансьор, шлюз) маршрутизира по хедъра, докато сървърът
  // изпълнява по тялото; разминат ли се двете, се отваря дупка. Затова
  // спецификацията иска сверка, а не доверие.
  const bodyVersion = metaVersion(parsed);
  if (headerVersion && bodyVersion && headerVersion !== bodyVersion) {
    return json(
      rpcError(
        id,
        RPC.HEADER_MISMATCH,
        `Хедърът MCP-Protocol-Version („${headerVersion}“) не отговаря на _meta в тялото („${bodyVersion}“).`,
      ),
      400,
    );
  }

  const { modern } = eraOf(parsed, headerVersion);
  if (modern) {
    const method = (parsed as { method?: unknown })?.method;
    const hMethod = req.headers.get("mcp-method");
    if (!hMethod) {
      return json(rpcError(id, RPC.HEADER_MISMATCH, "Липсва задължителният хедър Mcp-Method."), 400);
    }
    if (hMethod !== method) {
      return json(rpcError(id, RPC.HEADER_MISMATCH, "Хедърът Mcp-Method не отговаря на метода в тялото."), 400);
    }
    // `Mcp-Name` е задължителен за извикване на инструмент (а също за
    // resources/read и prompts/get, които не предлагаме).
    if (method === "tools/call") {
      const bodyName = (parsed as { params?: { name?: unknown } })?.params?.name;
      const hName = req.headers.get("mcp-name");
      if (!hName) {
        return json(rpcError(id, RPC.HEADER_MISMATCH, "Липсва задължителният хедър Mcp-Name."), 400);
      }
      if (decodeHeaderValue(hName) !== bodyName) {
        // Стойността на хедъра НЕ се отразява в отговора: тя е недоверен вход
        // и може да носи произволни байтове (или само да изглежда като каша,
        // ако клиентът е пратил не-ASCII, вместо да го кодира по правилото).
        return json(
          rpcError(id, RPC.HEADER_MISMATCH, "Хедърът Mcp-Name не отговаря на името на инструмента в тялото."),
          400,
        );
      }
    }
  }

  const { body, status } = handleRpc(parsed, headerVersion);
  if (body === null) {
    // Нотификация (например `notifications/initialized`) — приета, без тяло.
    return new NextResponse(null, { status: 202, headers: CORS });
  }
  // Съдържанието на заявката НЕ се логва: през тази точка минава текст, който
  // потребителят е написал в чата си (виж раздела за конектора в
  // /poveritelnost).
  return json(body, status);
}
