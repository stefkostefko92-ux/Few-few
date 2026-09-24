// Ядрото на MCP сървъра: чист JSON-RPC, без HTTP.
//
// Нарочно е отделено от `app/api/mcp/route.ts`, за да е тестируемо без мрежа —
// `handleRpc` е функция от съобщение към съобщение и няма състояние.
//
// Сървърът е БЕЗ СЕСИИ: всяко извикване е самостоятелно, инструментите са чисти
// функции (вход → линк) и нищо не се пази между заявките. Затова не раздаваме
// `Mcp-Session-Id` и отговаряме на GET с 405 — няма поток, който да държим.

import { TOOLS, ToolInputError, toolByName } from "@/lib/mcp/registry";

/** Ревизии, които приемаме. Първата е предпочитаната от нас. */
export const SUPPORTED_PROTOCOL = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const SERVER_INFO = {
  name: "mastilko",
  title: "Мастилко — безплатни образци за печат",
  version: "1.0.0",
} as const;

const INSTRUCTIONS = `
Мастилко е безплатен български инструмент за неща, които се ПРИНТИРАТ: етикети,
визитки, CV, мотивационни писма, грамоти, покани, табелки, WiFi стикери,
баджове, обяви с ресни, ваучери, календари и менюта.

Как работи: инструментите „napravi_…“ НЕ създават файл. Те сглобяват дизайна и
връщат адрес към mastilko-bg.com с попълнено съдържание. Дай адреса на
потребителя — той го отваря, вижда листа А4 на живо, може да промени всичко и
принтира или запазва PDF.

Съдържанието пътува в самия адрес и НЕ се запазва при нас — нямаме база данни.
Затова: не слагай чужди лични данни без нужда, а при WiFi стикера предупреди, че
паролата стои вътре в линка.

Пиши съдържанието на български, освен ако потребителят не поиска друго.
Не измисляй факти за човека (телефони, дати, фирми) — питай го или остави
полето празно.
`.trim();

// ── JSON-RPC типове (подмножеството, което ни трябва) ───────────────────────
export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
} as const;

export function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function rpcOk(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

/** Съобщение без `id` е нотификация — на нея НЕ се отговаря. */
export function isNotification(msg: unknown): boolean {
  return (
    typeof msg === "object" &&
    msg !== null &&
    !("id" in msg) &&
    typeof (msg as { method?: unknown }).method === "string"
  );
}

function negotiate(requested: unknown): string {
  // Спецификацията: ако поддържаме исканата версия — връщаме СЪЩАТА; иначе
  // връщаме наша (най-новата). Клиентът решава дали да продължи.
  if (typeof requested === "string" && (SUPPORTED_PROTOCOL as readonly string[]).includes(requested)) {
    return requested;
  }
  return SUPPORTED_PROTOCOL[0];
}

/**
 * Обработва едно JSON-RPC съобщение.
 * Връща отговор, или `null` за нотификация (тогава транспортът праща 202).
 */
export function handleRpc(msg: unknown): JsonRpcResponse | null {
  if (typeof msg !== "object" || msg === null || Array.isArray(msg)) {
    return rpcError(null, RPC.INVALID_REQUEST, "Очаква се един JSON-RPC обект.");
  }
  const m = msg as Partial<JsonRpcRequest> & { id?: JsonRpcId };
  const id: JsonRpcId = m.id ?? null;

  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") {
    return rpcError(id, RPC.INVALID_REQUEST, "Липсва „jsonrpc: 2.0“ или „method“.");
  }

  // Нотификации: приемаме мълчаливо (включително непознати — така изисква
  // JSON-RPC, а и клиентите пращат неща, които не ни засягат).
  if (!("id" in m) || m.id === undefined) return null;

  switch (m.method) {
    case "initialize": {
      const params = (m.params ?? {}) as { protocolVersion?: unknown };
      return rpcOk(id, {
        protocolVersion: negotiate(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }

    case "ping":
      return rpcOk(id, {});

    case "tools/list":
      return rpcOk(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
          annotations: {
            // Нищо не се записва и нищо не се чете отвън: всяко извикване е
            // чисто пресмятане. Това позволява на клиента да не пита за
            // потвърждение при всяко извикване.
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        })),
      });

    case "tools/call": {
      const params = (m.params ?? {}) as { name?: unknown; arguments?: unknown };
      if (typeof params.name !== "string") {
        return rpcError(id, RPC.INVALID_PARAMS, "Липсва име на инструмент („name“).");
      }
      const tool = toolByName(params.name);
      if (!tool) {
        return rpcError(id, RPC.INVALID_PARAMS, `Непознат инструмент: ${params.name}`);
      }
      try {
        return rpcOk(id, tool.run(params.arguments));
      } catch (err) {
        // Грешка във ВХОДА не е протоколна грешка — връща се като резултат с
        // `isError`, за да може моделът да я прочете и да поправи заявката.
        if (err instanceof ToolInputError) {
          return rpcOk(id, { content: [{ type: "text", text: err.message }], isError: true });
        }
        return rpcError(id, RPC.INTERNAL, "Вътрешна грешка при изпълнение на инструмента.");
      }
    }

    default:
      return rpcError(id, RPC.METHOD_NOT_FOUND, `Неподдържан метод: ${m.method}`);
  }
}
