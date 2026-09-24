// Ядрото на MCP сървъра: чист JSON-RPC, без HTTP.
//
// Нарочно е отделено от `app/api/mcp/route.ts`, за да е тестируемо без мрежа.
//
// ДВЕ ЕПОХИ НА ПРОТОКОЛА, едновременно:
//
//   • „модерна“ (2026-07-28, текущата) — БЕЗ ръкостискане. Всяка заявка носи
//     версията и способностите си в `params._meta`, има задължителен
//     `server/discover`, резултатите носят `resultType`, а непознат метод е
//     HTTP 404 (не 200 с грешка).
//   • „наследена“ (2025-06-18 и по-стари) — с `initialize`, `notifications/
//     initialized` и състояние по връзката.
//
// Защо и двете: спецификацията се премести на модерната, но ChatGPT и Claude
// днес говорят наследената. Сървър само с новата би бил „по книга“ и
// безполезен на практика; само със старата — жив, но остарял от деня на
// пускането. Затова епохата се разпознава за всяка заявка поотделно.
//
// Сървърът е БЕЗ СЕСИИ и в двете епохи: инструментите са чисти функции
// (вход → линк) и нищо не се пази между заявките.

import { TOOLS, ToolInputError, toolByName } from "@/lib/mcp/registry";

/** Текущата ревизия — без ръкостискане, с `server/discover`. */
export const MODERN_PROTOCOL = "2026-07-28";

/** Ревизиите с `initialize`, които ChatGPT и Claude ползват днес. */
export const LEGACY_PROTOCOL = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

/** Всичко, което приемаме. Първата е предпочитаната от нас. */
export const SUPPORTED_PROTOCOL = [MODERN_PROTOCOL, ...LEGACY_PROTOCOL] as const;

export const SERVER_INFO = {
  name: "mastilko",
  title: "Мастилко — безплатни образци за печат",
  version: "1.0.0",
  websiteUrl: "https://mastilko-bg.com",
  icons: [{ src: "https://mastilko-bg.com/icons/pechat.webp", mimeType: "image/webp", sizes: ["512x512"] }],
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

// ── JSON-RPC ────────────────────────────────────────────────────────────────
export type JsonRpcId = string | number | null;

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
  /** Хедърите не отговарят на тялото (или липсват задължителни). */
  HEADER_MISMATCH: -32020,
  /** Клиентът не е обявил способност, която заявката изисква. */
  MISSING_CLIENT_CAPABILITY: -32021,
  /** Не поддържаме поисканата ревизия на протокола. */
  UNSUPPORTED_PROTOCOL_VERSION: -32022,
} as const;

/** Ключове в `_meta`, запазени от спецификацията. */
export const META = {
  version: "io.modelcontextprotocol/protocolVersion",
  clientInfo: "io.modelcontextprotocol/clientInfo",
  clientCapabilities: "io.modelcontextprotocol/clientCapabilities",
  serverInfo: "io.modelcontextprotocol/serverInfo",
} as const;

/** Какво да върне транспортът: тяло + HTTP статус. */
export interface RpcOutcome {
  /** `null` при нотификация — транспортът праща 202 без тяло. */
  body: JsonRpcResponse | null;
  status: number;
}

export function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

export function isModern(version: string | undefined | null): boolean {
  return version === MODERN_PROTOCOL;
}

/** Вади версията от `params._meta`, ако я има. */
export function metaVersion(msg: unknown): string | undefined {
  const params = (msg as { params?: { _meta?: Record<string, unknown> } })?.params;
  const v = params?._meta?.[META.version];
  return typeof v === "string" ? v : undefined;
}

/**
 * Коя епоха говори тази заявка. Хедърът има предимство пред тялото — той е
 * това, по което посредниците маршрутизират; при разминаване транспортът
 * връща HeaderMismatch, преди да се стигне дотук.
 */
export function eraOf(msg: unknown, headerVersion?: string | null): {
  version: string;
  modern: boolean;
} {
  const method = (msg as { method?: unknown })?.method;
  const v = headerVersion || metaVersion(msg);
  if (v) return { version: v, modern: isModern(v) };
  // `server/discover` съществува само в модерната епоха — дори без версия,
  // клиент, който го вика, очаква модерен отговор.
  if (method === "server/discover") return { version: MODERN_PROTOCOL, modern: true };
  // Липсваща версия при наследен клиент: спецификацията позволява да се
  // приеме 2025-03-26.
  return { version: "2025-03-26", modern: false };
}

const CAPABILITIES = { tools: { listChanged: false } } as const;

/** Обгръща резултат според епохата: модерната иска `resultType` и `_meta`. */
function result(id: JsonRpcId, payload: Record<string, unknown>, modern: boolean): JsonRpcResponse {
  if (!modern) return { jsonrpc: "2.0", id, result: payload };
  return {
    jsonrpc: "2.0",
    id,
    result: {
      resultType: "complete",
      ...payload,
      _meta: { [META.serverInfo]: { name: SERVER_INFO.name, version: SERVER_INFO.version } },
    },
  };
}

function toolList() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
    ...(t.icons ? { icons: t.icons } : {}),
    annotations: {
      // Нищо не се записва и нищо не се чете отвън: всяко извикване е чисто
      // пресмятане. Това позволява на клиента да не иска потвърждение всеки път.
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }));
}

/**
 * Проверява задължителните полета в `_meta` на модерна заявка.
 * Връща грешка или `null`, ако всичко е наред.
 */
function checkModernMeta(id: JsonRpcId, msg: unknown): JsonRpcResponse | null {
  const params = (msg as { params?: { _meta?: Record<string, unknown> } })?.params;
  const meta = params?._meta;
  if (!meta || typeof meta[META.version] !== "string") {
    return rpcError(id, RPC.INVALID_PARAMS, `Липсва „${META.version}“ в _meta на заявката.`);
  }
  const caps = meta[META.clientCapabilities];
  if (typeof caps !== "object" || caps === null || Array.isArray(caps)) {
    return rpcError(id, RPC.INVALID_PARAMS, `Липсва „${META.clientCapabilities}“ в _meta на заявката.`);
  }
  return null;
}

/**
 * Обработва едно JSON-RPC съобщение.
 *
 * `headerVersion` е стойността на `MCP-Protocol-Version` (вече сверена с
 * тялото от транспорта). Връща тяло + HTTP статус; `body: null` е нотификация.
 */
export function handleRpc(msg: unknown, headerVersion?: string | null): RpcOutcome {
  if (typeof msg !== "object" || msg === null || Array.isArray(msg)) {
    return { body: rpcError(null, RPC.INVALID_REQUEST, "Очаква се един JSON-RPC обект."), status: 400 };
  }
  const m = msg as { jsonrpc?: unknown; id?: JsonRpcId; method?: unknown; params?: unknown };
  const id: JsonRpcId = m.id ?? null;

  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") {
    return { body: rpcError(id, RPC.INVALID_REQUEST, "Липсва „jsonrpc: 2.0“ или „method“."), status: 400 };
  }

  const { version, modern } = eraOf(msg, headerVersion);

  if (!(SUPPORTED_PROTOCOL as readonly string[]).includes(version)) {
    return {
      body: rpcError(id, RPC.UNSUPPORTED_PROTOCOL_VERSION, `Неподдържана версия на протокола: ${version}`, {
        supported: SUPPORTED_PROTOCOL,
      }),
      status: 400,
    };
  }

  // Нотификации (без `id`): приемаме мълчаливо. В модерната епоха ядрото на
  // протокола не дефинира клиентски нотификации по HTTP, но наследената праща
  // `notifications/initialized`.
  if (!("id" in m) || m.id === undefined) return { body: null, status: 202 };

  if (modern) {
    const bad = checkModernMeta(id, msg);
    if (bad) return { body: bad, status: 400 };
  }

  switch (m.method) {
    case "server/discover":
      // Задължителен в модерната епоха: версии, способности и самоличност
      // наведнъж, без да се пробва с отделни заявки.
      return {
        body: result(
          id,
          {
            supportedVersions: SUPPORTED_PROTOCOL,
            capabilities: CAPABILITIES,
            instructions: INSTRUCTIONS,
            // Каталогът и инструментите са статични — може да се кешира.
            ttlMs: 3_600_000,
            cacheScope: "public",
          },
          true,
        ),
        status: 200,
      };

    case "initialize": {
      // Само наследената епоха. Модерен клиент няма защо да го вика.
      const params = (m.params ?? {}) as { protocolVersion?: unknown };
      const asked = params.protocolVersion;
      // Ако поддържаме исканата — връщаме СЪЩАТА; иначе наша (най-новата
      // наследена, защото клиент с ръкостискане не говори модерната).
      const negotiated =
        typeof asked === "string" && (SUPPORTED_PROTOCOL as readonly string[]).includes(asked)
          ? asked
          : LEGACY_PROTOCOL[0];
      return {
        body: result(
          id,
          {
            protocolVersion: negotiated,
            capabilities: CAPABILITIES,
            serverInfo: SERVER_INFO,
            instructions: INSTRUCTIONS,
          },
          false,
        ),
        status: 200,
      };
    }

    case "ping":
      return { body: result(id, {}, modern), status: 200 };

    case "tools/list":
      return { body: result(id, { tools: toolList() }, modern), status: 200 };

    case "tools/call": {
      const params = (m.params ?? {}) as { name?: unknown; arguments?: unknown };
      if (typeof params.name !== "string") {
        return { body: rpcError(id, RPC.INVALID_PARAMS, "Липсва име на инструмент („name“)."), status: 400 };
      }
      const tool = toolByName(params.name);
      if (!tool) {
        return { body: rpcError(id, RPC.INVALID_PARAMS, `Непознат инструмент: ${params.name}`), status: 400 };
      }
      try {
        return { body: result(id, tool.run(params.arguments) as unknown as Record<string, unknown>, modern), status: 200 };
      } catch (err) {
        // Грешка във ВХОДА не е протоколна грешка — връща се като резултат с
        // `isError`, за да може моделът да я прочете и да поправи заявката.
        if (err instanceof ToolInputError) {
          return {
            body: result(id, { content: [{ type: "text", text: err.message }], isError: true }, modern),
            status: 200,
          };
        }
        return { body: rpcError(id, RPC.INTERNAL, "Вътрешна грешка при изпълнение на инструмента."), status: 500 };
      }
    }

    default:
      // Модерната епоха иска HTTP 404 за непознат метод, за да се различава от
      // 404-ката на стар HTTP+SSE сървър, който изобщо няма такъв адрес.
      return {
        body: rpcError(id, RPC.METHOD_NOT_FOUND, `Неподдържан метод: ${m.method}`),
        status: modern ? 404 : 200,
      };
  }
}
