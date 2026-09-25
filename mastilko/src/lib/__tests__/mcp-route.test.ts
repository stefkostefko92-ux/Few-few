import test from "node:test";
import assert from "node:assert/strict";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/mcp/route";
import { isAnthropicEgress, rateLimited, resetRateLimits } from "@/lib/mcp/rate-limit";
import { handleRpc, META, MODERN_PROTOCOL } from "@/lib/mcp/server";
import { searchCatalog } from "@/lib/mcp/catalog";

// Регресии за находките от прегледа на кода преди деплой.

/** Стъб на NextRequest — маршрутът ползва само headers.get и text(). */
function req(body: unknown, headers: Record<string, string> = {}, ip = "10.1.1.1"): NextRequest {
  const h: Record<string, string> = { "x-real-ip": ip, ...headers };
  const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as NextRequest;
}

const ping = (id: number) => ({ jsonrpc: "2.0", id, method: "ping" });

// ── Пакети ──────────────────────────────────────────────────────────────────

test("пакет: позволен за 2025-03-26 и връща по отговор на съобщение", async () => {
  resetRateLimits();
  const res = await POST(req([ping(1), ping(2), ping(3)]));
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as unknown[]).length, 3);
});

test("пакет: над 10 съобщения се отказва (беше ~500× усилване покрай лимита)", async () => {
  resetRateLimits();
  const big = Array.from({ length: 11 }, (_, i) => ping(i));
  const res = await POST(req(big));
  assert.equal(res.status, 400);
});

test("пакет: забранен в 2025-06-18 и в модерната епоха", async () => {
  resetRateLimits();
  assert.equal((await POST(req([ping(1)], { "MCP-Protocol-Version": "2025-06-18" }))).status, 400);
  assert.equal((await POST(req([ping(1)], { "MCP-Protocol-Version": MODERN_PROTOCOL }))).status, 400);
});

test("пакет НЕ заобикаля сверката на хедърите в модерната епоха", async () => {
  // Преди: хедър `Mcp-Method: tools/list` + масив с `tools/call` → 200 и
  // инструментът се изпълняваше, а без масив същото даваше 400.
  resetRateLimits();
  const modernCall = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "search",
      arguments: { query: "етикети" },
      _meta: { [META.version]: MODERN_PROTOCOL, [META.clientCapabilities]: {} },
    },
  };
  const res = await POST(req([modernCall], { "Mcp-Method": "tools/list" }));
  assert.equal(res.status, 400);
});

test("пакет се таксува по съобщение, не като една заявка", async () => {
  resetRateLimits();
  const ip = "10.9.9.9";
  // 12 пакета × 10 = 120 — точно лимитът на обикновен адрес.
  for (let i = 0; i < 12; i++) {
    const r = await POST(req(Array.from({ length: 10 }, (_, j) => ping(j)), {}, ip));
    assert.equal(r.status, 200, `пакет ${i + 1} трябваше да мине`);
  }
  assert.equal((await POST(req(ping(1), {}, ip))).status, 429, "121-вото съобщение трябва да е отказано");
});

// ── Невалиден id ────────────────────────────────────────────────────────────

test("id обект или масив → -32600, без да стига до JSON.stringify", () => {
  const out = handleRpc({ jsonrpc: "2.0", id: { a: 1 }, method: "ping" });
  assert.equal(out.status, 400);
  assert.equal(out.body?.error?.code, -32600);
  assert.equal(out.body?.id, null, "невалидното id НЕ се отразява");
});

test("дълбоко вложен id не срива сървъра (беше 500 с RangeError)", async () => {
  resetRateLimits();
  // Строим низа ръчно — JSON.parse ще го приеме, JSON.stringify би се сринал.
  const depth = 50_000;
  const raw = `{"jsonrpc":"2.0","method":"ping","id":${"[".repeat(depth)}${"]".repeat(depth)}}`;
  const res = await POST(req(raw));
  assert.equal(res.status, 400);
});

test("валидните видове id работят: низ, число, null", () => {
  for (const id of ["абв", 7, null]) {
    assert.equal(handleRpc({ jsonrpc: "2.0", id, method: "ping" }).status, 200, `id=${JSON.stringify(id)}`);
  }
});

// ── Лимити ──────────────────────────────────────────────────────────────────

test("диапазон на Anthropic: 160.79.104.0/21, точно по границите", () => {
  assert.equal(isAnthropicEgress("160.79.103.255"), false);
  assert.equal(isAnthropicEgress("160.79.104.0"), true);
  assert.equal(isAnthropicEgress("160.79.111.255"), true);
  assert.equal(isAnthropicEgress("160.79.112.0"), false);
  assert.equal(isAnthropicEgress("::ffff:160.79.105.1"), true, "IPv4-mapped IPv6");
  assert.equal(isAnthropicEgress("unknown"), false);
  assert.equal(isAnthropicEgress("2607:6bc0::1"), false, "входящият IPv6 не е изходящ");
});

test("всички адреси на Anthropic делят ЕДНА по-голяма кофа", () => {
  resetRateLimits();
  // 200 заявки от различни адреси в диапазона — над лимита на един адрес (120),
  // но в рамките на общата кофа (3000). Преди това беше 429 за всички.
  for (let i = 0; i < 200; i++) {
    assert.equal(rateLimited(`160.79.10${4 + (i % 8)}.${i % 250}`), false, `заявка ${i}`);
  }
});

test("обикновен адрес: 121-вата заявка е отказана", () => {
  resetRateLimits();
  for (let i = 0; i < 120; i++) assert.equal(rateLimited("10.2.2.2"), false);
  assert.equal(rateLimited("10.2.2.2"), true);
});

test("отказаната заявка НЕ пълни глобалния брояч", () => {
  resetRateLimits();
  // Флуд от един адрес далеч над лимита му…
  for (let i = 0; i < 5000; i++) rateLimited("10.3.3.3");
  // …не бива да изяде глобалния таван за останалите.
  assert.equal(rateLimited("10.4.4.4"), false);
});

// ── Търсене ─────────────────────────────────────────────────────────────────

test("търсене с 200 думи: взима първите 16 и пак намира", () => {
  const junk = Array.from({ length: 200 }, (_, i) => `шум${i}`).join(" ");
  const hits = searchCatalog(`етикети ${junk}`);
  assert.equal(hits[0]?.id, "etiketi");
  // Дума след 16-ата се пренебрегва.
  const late = searchCatalog(`${Array.from({ length: 20 }, (_, i) => `шум${i}`).join(" ")} етикети`);
  assert.equal(late.length, 0);
});
