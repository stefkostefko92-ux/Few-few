import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import path from "path";
import {
  handleRpc,
  eraOf,
  LEGACY_PROTOCOL,
  META,
  MODERN_PROTOCOL,
  SUPPORTED_PROTOCOL,
  type JsonRpcResponse,
} from "@/lib/mcp/server";
import { TOOLS, toolByName } from "@/lib/mcp/registry";
import { CATALOG } from "@/lib/mcp/catalog";
import { decodeState } from "@/lib/share";

/** `_meta`-то, което всяка МОДЕРНА заявка е длъжна да носи. */
const MODERN_META = {
  [META.version]: MODERN_PROTOCOL,
  [META.clientInfo]: { name: "тест", version: "1.0.0" },
  [META.clientCapabilities]: {},
};

/** Вика метод по НАСЛЕДЕНАТА епоха и настоява да има отговор. */
function call(method: string, params?: unknown, id: number | string = 1): JsonRpcResponse {
  const { body } = handleRpc({ jsonrpc: "2.0", id, method, params });
  assert.ok(body, `${method} трябваше да върне отговор`);
  return body;
}

/** Вика метод по МОДЕРНАТА епоха (с `_meta`) и връща тялото и статуса. */
function modern(method: string, params: Record<string, unknown> = {}, id: number | string = 1) {
  const out = handleRpc(
    { jsonrpc: "2.0", id, method, params: { ...params, _meta: MODERN_META } },
    MODERN_PROTOCOL,
  );
  assert.ok(out.body, `${method} трябваше да върне отговор`);
  return { body: out.body, status: out.status };
}

/** Вика инструмент и връща resultа му. */
function callTool(name: string, args: unknown): Record<string, unknown> {
  const res = call("tools/call", { name, arguments: args });
  assert.equal(res.error, undefined, `протоколна грешка: ${JSON.stringify(res.error)}`);
  return res.result as Record<string, unknown>;
}

/** Вади състоянието обратно от върнатия линк (`…#p=<base64url>`). */
function stateFromUrl(url: string): Record<string, unknown> {
  const m = /#p=(.+)$/.exec(url);
  assert.ok(m, `линкът няма споделено състояние: ${url}`);
  const state = decodeState(m[1]!);
  assert.ok(state, "състоянието в линка не се декодира");
  return state as Record<string, unknown>;
}

// ── Протокол ────────────────────────────────────────────────────────────────

test("initialize: връща СЪЩАТА версия, ако я поддържаме", () => {
  const res = call("initialize", { protocolVersion: "2025-06-18" });
  const r = res.result as { protocolVersion: string; capabilities: { tools: unknown } };
  assert.equal(r.protocolVersion, "2025-06-18");
  assert.ok(r.capabilities.tools, "трябва да обяви способността „tools“");
});

test("initialize: при непозната версия връща наша, не грешка", () => {
  const res = call("initialize", { protocolVersion: "1999-01-01" });
  assert.equal(res.error, undefined, "по спецификация НЕ е грешка");
  // НАЙ-новата НАСЛЕДЕНА, не 2026-07-28: клиент, който изобщо вика
  // `initialize`, по определение не говори модерната епоха.
  assert.equal((res.result as { protocolVersion: string }).protocolVersion, LEGACY_PROTOCOL[0]);
});

test("нотификация: не получава отговор (транспортът праща 202)", () => {
  const a = handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(a.body, null);
  assert.equal(a.status, 202);
  // Непозната нотификация също се приема мълчаливо.
  assert.equal(handleRpc({ jsonrpc: "2.0", method: "notifications/нещо" }).body, null);
});

test("непознат метод → -32601, а счупено съобщение → -32600", () => {
  assert.equal(call("няма/такъв").error?.code, -32601);
  assert.equal(handleRpc({ id: 1, method: "ping" }).body?.error?.code, -32600, "липсващ jsonrpc:2.0");
  assert.equal(handleRpc("низ").body?.error?.code, -32600);
  assert.equal(handleRpc(null).body?.error?.code, -32600);
});

test("ping връща празен резултат", () => {
  assert.deepEqual(call("ping").result, {});
});

test("tools/list: всеки инструмент има име, описание и валидна входна схема", () => {
  const tools = (call("tools/list").result as { tools: Array<Record<string, unknown>> }).tools;
  assert.equal(tools.length, TOOLS.length);
  const names = new Set<string>();
  for (const t of tools) {
    assert.match(String(t.name), /^[a-z][a-z0-9_]*$/, `лошо име: ${t.name}`);
    assert.ok(!names.has(String(t.name)), `дублирано име: ${t.name}`);
    names.add(String(t.name));
    assert.ok(String(t.description).length > 40, `твърде кратко описание: ${t.name}`);
    const schema = t.inputSchema as { type: string; properties: Record<string, unknown> };
    assert.equal(schema.type, "object");
    assert.ok(schema.properties && Object.keys(schema.properties).length > 0);
  }
});

test("tools/call: непознат инструмент → протоколна грешка -32602", () => {
  const res = call("tools/call", { name: "няма_такъв", arguments: {} });
  assert.equal(res.error?.code, -32602);
});

test("tools/call: невалиден ВХОД не е протоколна грешка, а isError резултат", () => {
  // Моделът трябва да може да ПРОЧЕТЕ какво е сбъркал и да поправи заявката.
  const r = callTool("napravi_vizitki", { name: "" });
  assert.equal(r.isError, true);
  const text = (r.content as Array<{ text: string }>)[0]!.text;
  assert.match(text, /napravi_vizitki/);
});

// ── Инструменти за създаване ────────────────────────────────────────────────

test("визитки: връща линк, чието състояние се декодира обратно", () => {
  const r = callTool("napravi_vizitki", {
    name: "Иван Петров",
    company: "Мечта ООД",
    phone: "0888 123 456",
    qr: true,
  });
  const url = (r.structuredContent as { url: string }).url;
  assert.match(url, /^https:\/\/mastilko-bg\.com\/vizitki#p=/);
  const state = stateFromUrl(url);
  assert.equal(state.name, "Иван Петров");
  assert.equal(state.company, "Мечта ООД");
  assert.equal(state.qr, true);
});

test("кирилицата оцелява през base64url (роундтрип без загуба)", () => {
  const r = callTool("napravi_tabelka", { title: "ОТВОРЕНО", subtitle: "Пон–Пет 9:00 – 18:00" });
  const state = stateFromUrl((r.structuredContent as { url: string }).url);
  assert.equal(state.title, "ОТВОРЕНО");
  assert.equal(state.subtitle, "Пон–Пет 9:00 – 18:00");
});

test("календар: месецът навън е 1–12, а в състоянието 0–11", () => {
  // Точно тази разлика би дала „септември“ вместо „октомври“, ако я объркаме.
  const state = stateFromUrl(
    (callTool("napravi_kalendar", { year: 2026, month: 9 }).structuredContent as { url: string }).url,
  );
  assert.equal(state.month, 8, "9 (септември) трябва да стане 8");
  assert.equal(state.year, 2026);
  // Границите също се превеждат правилно.
  assert.equal(stateFromUrl((callTool("napravi_kalendar", { year: 2026, month: 1 }).structuredContent as { url: string }).url).month, 0);
  assert.equal(stateFromUrl((callTool("napravi_kalendar", { year: 2026, month: 12 }).structuredContent as { url: string }).url).month, 11);
  // Месец 0 или 13 е извън схемата.
  assert.equal(callTool("napravi_kalendar", { year: 2026, month: 0 }).isError, true);
  assert.equal(callTool("napravi_kalendar", { year: 2026, month: 13 }).isError, true);
});

test("баджове: списъкът гости отива в полето за серия на студиото", () => {
  const r = callTool("napravi_badzhove", {
    eventName: "Конференция 2026",
    guests: "Иван Петров | Лектор | Мечта ООД\nМария Иванова | Гост",
  });
  const state = stateFromUrl((r.structuredContent as { url: string }).url);
  assert.equal(state.eventName, "Конференция 2026");
  assert.match(String(state.series), /Мария Иванова/);
  assert.equal(state.guests, undefined, "„guests“ е наше име, не бива да изтича в състоянието");
  assert.match(String((r.structuredContent as { summary: string }).summary), /2 гости/);
});

test("CV: позициите и образованието получават id, както ги иска студиото", () => {
  const r = callTool("napravi_cv", {
    name: "Иван Петров",
    layout: "europass",
    jobs: [{ role: "Счетоводител", company: "Мечта ООД", period: "2023 — сега" }],
    schools: [{ degree: "Икономика", school: "УНСС" }],
  });
  const state = stateFromUrl((r.structuredContent as { url: string }).url);
  const jobs = state.jobs as Array<Record<string, unknown>>;
  assert.equal(jobs[0]!.id, 1, "липсващо id чупи рендера на списъка");
  assert.equal(jobs[0]!.desc, "", "незададеното описание трябва да е низ, не undefined");
  assert.equal((state.schools as Array<Record<string, unknown>>)[0]!.id, 1);
});

test("темата се прилага само когато е поискана", () => {
  const без = stateFromUrl((callTool("napravi_tabelka", { title: "Тест" }).structuredContent as { url: string }).url);
  assert.equal(без.themeId, undefined, "без тема оставяме подразбирането на студиото");
  const с = stateFromUrl(
    (callTool("napravi_tabelka", { title: "Тест", themeId: "gora" }).structuredContent as { url: string }).url,
  );
  assert.equal(с.themeId, "gora");
  assert.equal(callTool("napravi_tabelka", { title: "Тест", themeId: "няма" }).isError, true);
});

test("твърде дълъг текст се отказва ЯСНО, вместо да прави мъртъв линк", () => {
  // Ако пуснем текст над схемата на студиото, `ProjectSchema.parse` хвърля в
  // браузъра, грешката се гълта и потребителят отваря празен редактор.
  const r = callTool("napravi_tabelka", { title: "х".repeat(61) });
  assert.equal(r.isError, true);
});

test("непознати полета не се промъкват в състоянието", () => {
  const r = callTool("napravi_tabelka", { title: "Тест", злоумишлено: "<script>" });
  assert.equal(r.isError, true, "схемата е затворена (additionalProperties: false)");
});

// ── search и fetch (съвместимост с проучването на ChatGPT) ──────────────────

test("search: връща id/title/url и дублира JSON-а в текстов блок", () => {
  const r = callTool("search", { query: "стикери за буркани" });
  const sc = r.structuredContent as { results: Array<{ id: string; title: string; url: string }> };
  assert.ok(sc.results.length > 0);
  assert.equal(sc.results[0]!.id, "etiketi", "синонимът трябва да води до етикетите");
  for (const hit of sc.results) {
    assert.ok(hit.url.startsWith("https://mastilko-bg.com/"), "без адрес ChatGPT не прави цитат");
  }
  // Текстовият блок трябва да носи СЪЩИЯ JSON — така иска OpenAI.
  assert.deepEqual(JSON.parse((r.content as Array<{ text: string }>)[0]!.text), sc);
});

test("search: намира и по чужда дума, и по име на инструмент", () => {
  const byAlias = (callTool("search", { query: "резюме" }).structuredContent as { results: Array<{ id: string }> }).results;
  assert.equal(byAlias[0]!.id, "cv");
  const byName = (callTool("search", { query: "меню" }).structuredContent as { results: Array<{ id: string }> }).results;
  assert.ok(byName.some((r) => r.id === "menu"));
});

test("fetch: връща пълния запис, а непознат id дава четима грешка", () => {
  const r = callTool("fetch", { id: "wifi" });
  const sc = r.structuredContent as { id: string; title: string; text: string; url: string };
  assert.equal(sc.id, "wifi");
  assert.ok(sc.text.length > 100);
  assert.equal(sc.url, "https://mastilko-bg.com/wifi");
  const bad = callTool("fetch", { id: "няма" });
  assert.equal(bad.isError, true);
});

test("каталогът покрива ВСИЧКИТЕ 14 инструмента на сайта", () => {
  // Дрейфът между сайта и каталога е точно проблемът, който SEO работата
  // оправи в футъра и llms.txt — тук го заключваме с тест.
  const expected = [
    "etiketi", "vizitki", "cv", "pismo", "gramoti", "pokani", "tabelki",
    "wifi", "badzhove", "obyava", "vaucheri", "kalendar", "menu", "dokumentni-snimki",
  ];
  assert.deepEqual(CATALOG.map((c) => c.id).sort(), [...expected].sort());
});

// ── Съответствие със студията ───────────────────────────────────────────────

test("границите на текстовете НЕ надвишават схемите на студията", () => {
  // Ако наш максимум е по-голям от този на студиото, линкът се отваря празен
  // (грешката се гълта в useLocalState) — мълчалив провал, който само тест
  // може да хване. Затова четем истинските схеми от изходния код.
  const studios: Record<string, string> = {
    napravi_etiketi: "LabelStudio",
    napravi_vizitki: "CardStudio",
    napravi_cv: "CvStudio",
    napravi_motivacionno_pismo: "PismoStudio",
    napravi_gramota: "GramotaStudio",
    napravi_pokana: "PokanaStudio",
    napravi_tabelka: "TabelkaStudio",
    napravi_wifi_stiker: "WifiStudio",
    napravi_badzhove: "BadgeStudio",
    napravi_obyava: "ObyavaStudio",
    napravi_vaucheri: "VoucherStudio",
    napravi_kalendar: "CalendarStudio",
    napravi_menu: "MenuStudio",
  };
  // Наше име на поле → име в студиото, където се разминават нарочно.
  const renamed: Record<string, string> = { guests: "series" };

  for (const [toolName, studio] of Object.entries(studios)) {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/studios", `${studio}.tsx`),
      "utf8",
    );
    const tool = toolByName(toolName);
    assert.ok(tool, `липсва инструмент ${toolName}`);
    const props = (tool.inputSchema as { properties: Record<string, { maxLength?: number }> }).properties;

    for (const [field, def] of Object.entries(props)) {
      if (def.maxLength === undefined) continue;
      const target = renamed[field] ?? field;
      const m = new RegExp(`\\b${target}: z\\.string\\(\\)\\.max\\((\\d+)\\)`).exec(src);
      if (!m) continue; // полета извън ProjectSchema (напр. themeId) се пропускат
      const studioMax = Number(m[1]);
      assert.ok(
        def.maxLength <= studioMax,
        `${toolName}.${field}: нашият максимум ${def.maxLength} е над ${studioMax} в ${studio}`,
      );
    }
  }
});

test("всички инструменти за създаване сочат към истинска страница от каталога", () => {
  const ids = new Set(CATALOG.map((c) => c.id));
  for (const t of TOOLS) {
    if (!t.name.startsWith("napravi_")) continue;
    const r = t.run(minimalArgsFor(t.name)) as { structuredContent?: { tool?: string } };
    const slug = r.structuredContent?.tool;
    assert.ok(slug && ids.has(slug), `${t.name} сочи към непознат адрес: ${slug}`);
  }
});

/** Най-малкото, с което всеки инструмент минава валидацията. */
function minimalArgsFor(name: string): Record<string, unknown> {
  switch (name) {
    case "napravi_vizitki": return { name: "Иван" };
    case "napravi_cv": return { name: "Иван" };
    case "napravi_motivacionno_pismo": return { name: "Иван" };
    case "napravi_tabelka": return { title: "ОТВОРЕНО" };
    case "napravi_wifi_stiker": return { ssid: "Mreja" };
    case "napravi_badzhove": return { eventName: "Събитие", guests: "Иван" };
    case "napravi_obyava": return { title: "Уроци", contact: "0888" };
    case "napravi_vaucheri": return { business: "Салон", value: "−20%" };
    case "napravi_kalendar": return { year: 2026, month: 1 };
    case "napravi_menu": return { title: "Кафе", body: "## Кафе\nЕспресо | 2.00" };
    default: return {};
  }
}

// ── Модерната епоха (ревизия 2026-07-28) ────────────────────────────────────

test("server/discover: задължителният модерен вход връща версии и способности", () => {
  const { body, status } = modern("server/discover");
  assert.equal(status, 200);
  const r = body.result as Record<string, unknown>;
  assert.equal(r.resultType, "complete", "модерните резултати носят resultType");
  assert.ok((r.supportedVersions as string[]).includes(MODERN_PROTOCOL));
  assert.ok((r.supportedVersions as string[]).includes(LEGACY_PROTOCOL[0]), "и наследените се обявяват");
  assert.ok((r.capabilities as { tools?: unknown }).tools, "обявяваме инструменти");
  const meta = r._meta as Record<string, { name: string }>;
  assert.equal(meta[META.serverInfo]!.name, "mastilko");
});

test("модерна заявка БЕЗ _meta се отхвърля с -32602 и HTTP 400", () => {
  // Без ръкостискане това е единственото място, където версията и
  // способностите изобщо се обявяват — липсва ли, заявката е негодна.
  const out = handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, MODERN_PROTOCOL);
  assert.equal(out.status, 400);
  assert.equal(out.body?.error?.code, -32602);
});

test("модерна заявка без clientCapabilities също е негодна", () => {
  const out = handleRpc(
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [META.version]: MODERN_PROTOCOL } } },
    MODERN_PROTOCOL,
  );
  assert.equal(out.status, 400);
  assert.equal(out.body?.error?.code, -32602);
});

test("resultType и serverInfo има САМО в модерната епоха", () => {
  const m = modern("tools/list").body.result as Record<string, unknown>;
  assert.equal(m.resultType, "complete");
  assert.ok(m._meta);
  // Наследеният клиент получава стария вид, непроменен.
  const l = call("tools/list").result as Record<string, unknown>;
  assert.equal(l.resultType, undefined);
  assert.equal(l._meta, undefined);
});

test("непознат метод: 404 в модерната епоха, 200 в наследената", () => {
  // Модерната иска 404, за да се различава от стар сървър без такъв адрес.
  assert.equal(modern("няма/такъв").status, 404);
  assert.equal(modern("няма/такъв").body.error?.code, -32601);
  const legacy = handleRpc({ jsonrpc: "2.0", id: 1, method: "няма/такъв" }, "2025-06-18");
  assert.equal(legacy.status, 200);
  assert.equal(legacy.body?.error?.code, -32601);
});

test("неподдържана версия → -32022 със списък на поддържаните", () => {
  const out = handleRpc({ jsonrpc: "2.0", id: 1, method: "ping" }, "1999-01-01");
  assert.equal(out.status, 400);
  assert.equal(out.body?.error?.code, -32022);
  assert.deepEqual((out.body?.error?.data as { supported: string[] }).supported, [...SUPPORTED_PROTOCOL]);
});

test("епохата се разпознава: хедър > _meta > метод > подразбиране", () => {
  assert.equal(eraOf({ method: "ping" }, MODERN_PROTOCOL).modern, true, "хедърът решава");
  assert.equal(
    eraOf({ method: "ping", params: { _meta: { [META.version]: MODERN_PROTOCOL } } }).modern,
    true,
    "без хедър решава _meta",
  );
  // `server/discover` съществува само в модерната — разпознава се и без версия.
  assert.equal(eraOf({ method: "server/discover" }).modern, true);
  // Нищо не сочи епоха → наследена, както позволява спецификацията.
  assert.equal(eraOf({ method: "ping" }).version, "2025-03-26");
  assert.equal(eraOf({ method: "ping" }).modern, false);
});

test("инструментите работят и по модерната епоха", () => {
  const { body } = modern("tools/call", {
    name: "napravi_tabelka",
    arguments: { title: "ОТВОРЕНО" },
  });
  const r = body.result as { resultType: string; structuredContent: { url: string } };
  assert.equal(r.resultType, "complete");
  assert.match(r.structuredContent.url, /^https:\/\/mastilko-bg\.com\/tabelki#p=/);
});

test("initialize остава наследен и договаря наследена версия", () => {
  // Клиент с ръкостискане не говори модерната — не бива да му я връщаме.
  const r = call("initialize", { protocolVersion: "1999-01-01" }).result as { protocolVersion: string };
  assert.equal(r.protocolVersion, LEGACY_PROTOCOL[0]);
  assert.notEqual(r.protocolVersion, MODERN_PROTOCOL);
});

test("всеки инструмент носи икона от нашия домейн", () => {
  for (const t of TOOLS) {
    assert.ok(t.icons && t.icons.length > 0, `${t.name} е без икона`);
    for (const ic of t.icons) {
      assert.match(ic.src, /^https:\/\/mastilko-bg\.com\/icons\/[a-z]+\.webp$/, `${t.name}: ${ic.src}`);
    }
  }
});
