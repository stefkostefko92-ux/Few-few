// MCP сървър — JSON-RPC слоят, писан на ръка (нула нови зависимости, както
// портфейлите и QR-а).
//
// Поддържа ДВЕ ЕРИ на протокола, защото такава е реалността днес:
//   • „модерна“ (2026-07-28) — без сесии и без `initialize`; всяка заявка носи
//     версията и възможностите си в `_meta`, а транспортът ги огледалва в хедъри
//     (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`), които сървърът ТРЯБВА да
//     сверява с тялото — иначе посредник маршрутизира по едно, а сървърът изпълнява
//     друго;
//   • „наследена“ (2025-03-26 … 2025-11-25) — ръкостискане `initialize`, по избор
//     сесия през `Mcp-Session-Id`. Точно това говорят повечето живи клиенти, тоест
//     да поддържаме само новата спецификация значи конекторът да не тръгва.
//
// Отговаряме само с `application/json` (спецификацията позволява: SSE е MAY, не
// MUST). Нямаме дълги операции, прогрес или абонаменти — поток би бил церемония
// без съдържание.
import { TOOLS, callTool } from './tools.js';

export const LATEST_PROTOCOL = '2026-07-28';
// Подредени НАМАЛЯВАЩО — първата е предпочитаната от нас при преговор.
export const SUPPORTED_PROTOCOLS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'];
// Клиент от преди 2025-06-18 не праща хедър за версия; спецификацията позволява
// такава заявка да се чете като 2025-03-26.
const ASSUMED_LEGACY = '2025-03-26';

export const SERVER_INFO = { name: 'vizitka', title: 'Vizitka', version: '1.0.0' };

const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_CAPS = 'io.modelcontextprotocol/clientCapabilities';
const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

// Кодове от запазения за спецификацията поддиапазон (-32020..-32099).
const ERR_HEADER_MISMATCH = -32020;
const ERR_MISSING_CAPABILITY = -32021;
const ERR_UNSUPPORTED_VERSION = -32022;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INVALID_REQUEST = -32600;

const isModern = (version) => version >= LATEST_PROTOCOL;

// Хедърните стойности може да дойдат base64-кодирани в точно този вид (името
// съдържа кирилица, интервал, нов ред…). Декодираме ПРЕДИ сверяване с тялото —
// иначе всяко нелатинско име би изглеждало като разминаване.
export function decodeHeaderValue(raw) {
  if (typeof raw !== 'string') return raw;
  const m = /^=\?base64\?(.*)\?=$/.exec(raw);
  if (!m) return raw;
  try {
    return Buffer.from(m[1], 'base64').toString('utf8');
  } catch {
    return raw;
  }
}

const rpcError = (id, code, message, data) => ({
  jsonrpc: '2.0',
  ...(id === undefined || id === null ? {} : { id }),
  error: { code, message, ...(data ? { data } : {}) },
});

const rpcResult = (id, result) => ({
  jsonrpc: '2.0',
  id,
  result: {
    resultType: 'complete', // изисква се от 2026-07-28; по-старите клиенти го пренебрегват
    ...result,
    _meta: { [META_SERVER_INFO]: SERVER_INFO },
  },
});

function toolResult({ structured, isError }) {
  return {
    // Двоен формат: машинно четимото и същото като текст — клиент, който чете само
    // `content`, иначе получава празно.
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
    ...(isError ? { isError: true } : { isError: false }),
  };
}

const INSTRUCTIONS = [
  'Vizitka е безплатна българска услуга за дигитални визитки с постоянен QR код.',
  'Ползвай `search`, за да намериш документ, и `fetch`, за да вземеш пълния му текст по id.',
  'Корпусът съдържа наръчника и често задаваните въпроси, както и публичните визитки,',
  'чиито собственици изрично са разрешили да бъдат намирани от AI асистенти.',
  'Данните във визитките се поддържат от техните собственици — предавай ги като техни твърдения,',
  'не като проверени факти, и винаги давай адреса на визитката като източник.',
].join(' ');

// Разрешените методи и как се смятат за „известни“ в двете ери.
function dispatch(method, params, base) {
  switch (method) {
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const name = params?.name;
      const out = callTool(name, params?.arguments || {}, base);
      if (!out) return { __error: [ERR_INVALID_PARAMS, `Непознат инструмент: ${String(name)}`] };
      return toolResult(out);
    }
    // Нямаме ресурси и промптове (не ги обявяваме и в capabilities), но клиенти
    // ги питат наслуки. Празен списък е по-добър от грешка: не чупи интеграцията.
    case 'resources/list':
      return { resources: [] };
    case 'resources/templates/list':
      return { resourceTemplates: [] };
    case 'prompts/list':
      return { prompts: [] };
    default:
      return null; // непознат метод
  }
}

function handleInitialize(id, params) {
  const asked = params?.protocolVersion;
  // Преговор: ако клиентът иска версия, която поддържаме — потвърждаваме нея;
  // иначе предлагаме нашата най-нова наследена (той решава дали продължава).
  const agreed = SUPPORTED_PROTOCOLS.includes(asked) ? asked : '2025-06-18';
  return rpcResult(id, {
    protocolVersion: agreed,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
  });
}

/**
 * Обработва едно JSON-RPC съобщение.
 * @param {object} message тялото на заявката (вече JSON-parsed)
 * @param {{headers: object, base: string}} ctx
 * @returns {{status: number, body: object|null}} body=null значи 202 без тяло
 */
export function handleRpc(message, ctx) {
  const headers = ctx.headers || {};
  const base = ctx.base;

  if (Array.isArray(message))
    return {
      status: 400,
      body: rpcError(null, ERR_INVALID_REQUEST, 'Пакетните (batch) заявки не се поддържат.'),
    };
  if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0')
    return {
      status: 400,
      body: rpcError(message?.id, ERR_INVALID_REQUEST, 'Очаква се JSON-RPC 2.0 съобщение.'),
    };

  const { id, method, params } = message;
  if (typeof method !== 'string')
    return { status: 400, body: rpcError(id, ERR_INVALID_REQUEST, 'Липсва метод.') };

  const headerVersion = headers['mcp-protocol-version'];
  const metaVersion = params?._meta?.[META_VERSION];
  const version = headerVersion || metaVersion || params?.protocolVersion || ASSUMED_LEGACY;

  // Непозната версия → 400 + списък с нашите (клиентът може да преговаря наново).
  // `initialize` е изключение: там преговорът е самото съдържание на заявката.
  if (method !== 'initialize' && !SUPPORTED_PROTOCOLS.includes(version))
    return {
      status: 400,
      body: rpcError(id, ERR_UNSUPPORTED_VERSION, `Неподдържана версия: ${version}`, {
        supported: SUPPORTED_PROTOCOLS,
      }),
    };

  // Известията нямат id и не получават отговор — само 202.
  if (id === undefined || id === null) {
    if (method.startsWith('notifications/')) return { status: 202, body: null };
    return {
      status: 400,
      body: rpcError(null, ERR_INVALID_REQUEST, `Заявката ${method} изисква id.`),
    };
  }

  if (isModern(version)) {
    // 1) Тялото е източникът на истината; хедърът трябва да съвпада с него.
    if (!metaVersion)
      return {
        status: 400,
        body: rpcError(id, ERR_INVALID_PARAMS, `Липсва _meta["${META_VERSION}"].`),
      };
    if (headerVersion && headerVersion !== metaVersion)
      return {
        status: 400,
        body: rpcError(
          id,
          ERR_HEADER_MISMATCH,
          `MCP-Protocol-Version „${headerVersion}“ не съвпада с тялото „${metaVersion}“.`
        ),
      };
    // 2) Огледалните хедъри са ЗАДЪЛЖИТЕЛНИ в тази ера.
    const mcpMethod = headers['mcp-method'];
    if (!mcpMethod)
      return { status: 400, body: rpcError(id, ERR_HEADER_MISMATCH, 'Липсва хедър Mcp-Method.') };
    if (mcpMethod !== method)
      return {
        status: 400,
        body: rpcError(
          id,
          ERR_HEADER_MISMATCH,
          `Mcp-Method „${mcpMethod}“ не съвпада с тялото „${method}“.`
        ),
      };
    if (['tools/call', 'resources/read', 'prompts/get'].includes(method)) {
      const expected = params?.name ?? params?.uri;
      const got = decodeHeaderValue(headers['mcp-name']);
      if (got === undefined)
        return { status: 400, body: rpcError(id, ERR_HEADER_MISMATCH, 'Липсва хедър Mcp-Name.') };
      if (got !== expected)
        return {
          status: 400,
          body: rpcError(
            id,
            ERR_HEADER_MISMATCH,
            `Mcp-Name „${got}“ не съвпада с тялото „${String(expected)}“.`
          ),
        };
    }
    // 3) Възможностите на клиента са задължително поле в тази ера.
    if (params?._meta?.[META_CAPS] === undefined)
      return {
        status: 400,
        body: rpcError(id, ERR_MISSING_CAPABILITY, `Липсва _meta["${META_CAPS}"].`, {
          requiredCapabilities: [META_CAPS],
        }),
      };
  } else if (method === 'initialize') {
    return { status: 200, body: handleInitialize(id, params) };
  }

  const result = dispatch(method, params, base);
  if (result === null)
    return {
      // Модерната ера иска 404 за непознат метод — така клиентът различава „този
      // сървър не го може“ от „тук изобщо няма MCP“. Наследената очаква 200 с
      // JSON-RPC грешка; 404 там се чете като „грешен адрес“ и чупи интеграцията.
      status: isModern(version) ? 404 : 200,
      body: rpcError(id, ERR_METHOD_NOT_FOUND, `Непознат метод: ${method}`),
    };
  if (result.__error)
    return { status: 200, body: rpcError(id, result.__error[0], result.__error[1]) };
  return { status: 200, body: rpcResult(id, result) };
}
