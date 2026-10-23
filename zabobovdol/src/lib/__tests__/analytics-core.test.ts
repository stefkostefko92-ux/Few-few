import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyPageRequest,
  groupPath,
  hitKey,
  constantTimeEqual,
  weekStart,
  median,
  safeRate,
  formatPct,
  northStar,
  ymd,
} from "@/lib/analytics-core";

const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

function req(pathname: string, h: Record<string, string> = {}, method = "GET") {
  const headers: Record<string, string> = { "user-agent": UA, ...h };
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, pathname, header: (n: string) => lower[n.toLowerCase()] ?? null };
}

const HTML = { accept: "text/html,application/xhtml+xml", "sec-fetch-dest": "document" };

test("пълно зареждане на страница се брои", () => {
  assert.deepEqual(classifyPageRequest(req("/", HTML)), { count: true });
  assert.deepEqual(classifyPageRequest(req("/kak-da/pensiya", HTML)), { count: true });
});

test("навигация без презареждане (RSC) не се брои в middleware — неразличима от prefetch", () => {
  // Next 15 маха RSC/Next-Router-Prefetch преди middleware: остава fetch с Accept */*.
  assert.deepEqual(classifyPageRequest(req("/uslugi", { accept: "*/*", "sec-fetch-dest": "empty" })), {
    count: false,
    reason: "not-page",
  });
  assert.deepEqual(classifyPageRequest(req("/uslugi", { ...HTML, rsc: "1" })), {
    count: false,
    reason: "not-page",
  });
});

test("prefetch не се брои (Next и браузърите)", () => {
  const cases: Record<string, string>[] = [
    { rsc: "1", "next-router-prefetch": "1" },
    { rsc: "1", "next-router-segment-prefetch": "/_tree" },
    { ...HTML, purpose: "prefetch" },
    { ...HTML, "sec-purpose": "prefetch;prerender" },
    { ...HTML, "x-moz": "prefetch" },
  ];
  for (const h of cases) {
    assert.deepEqual(classifyPageRequest(req("/uslugi", h)), { count: false, reason: "prefetch" });
  }
});

test("ботове, празен UA и проверки не се броят", () => {
  for (const ua of ["Googlebot/2.1", "facebookexternalhit/1.1", "curl/8.0", "UptimeRobot/2.0", ""]) {
    const r = classifyPageRequest(req("/", { ...HTML, "user-agent": ua }));
    assert.deepEqual(r, { count: false, reason: "bot" }, ua);
  }
});

test("админ, API, служебни, QR пренасочване и файлове не се броят", () => {
  for (const p of [
    "/admin",
    "/admin/statistika",
    "/api/e",
    "/_next/static/x.js",
    "/p/apteka",
    "/favicon.ico",
    "/sitemap.xml",
    "/novini/rss.xml",
    "/.well-known/assetlinks.json",
  ]) {
    assert.deepEqual(classifyPageRequest(req(p, HTML)), { count: false, reason: "path" }, p);
  }
  // „/administrativni“ НЕ е админ — само /admin и /admin/…
  assert.deepEqual(classifyPageRequest(req("/administrativni", HTML)), { count: true });
});

test("POST (server actions), HEAD и не-страници не се броят", () => {
  assert.equal(classifyPageRequest(req("/kontakti", { ...HTML, "next-action": "x" }, "POST")).count, false);
  assert.equal(classifyPageRequest(req("/", HTML, "HEAD")).count, false);
  assert.deepEqual(classifyPageRequest(req("/uslugi", { accept: "image/*", "sec-fetch-dest": "image" })), {
    count: false,
    reason: "not-page",
  });
  assert.deepEqual(classifyPageRequest(req("/uslugi", { accept: "text/html", "sec-fetch-dest": "iframe" })), {
    count: false,
    reason: "not-page",
  });
});

test("пътища: познат раздел се пази, боклукът → /other, до 3 нива", () => {
  assert.equal(groupPath("/"), "/");
  assert.equal(groupPath("/kak-da/pensiya"), "/kak-da/pensiya");
  assert.equal(groupPath("/pechat/plakat"), "/pechat/plakat");
  assert.equal(groupPath("/wp-admin/setup"), "/other");
  assert.equal(groupPath("/other"), "/other");
  assert.equal(groupPath("/uslugi/a/b/c/d"), "/uslugi/a/b");
});

test("вътрешният ключ: изведен от тайната, стабилен, без къса тайна", async () => {
  const a = await hitKey("x".repeat(40));
  const b = await hitKey("x".repeat(40));
  const c = await hitKey("y".repeat(40));
  assert.ok(a && /^[0-9a-f]{64}$/.test(a));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(!a!.includes("x".repeat(40)));
  assert.equal(await hitKey("кратка"), null);
  assert.equal(await hitKey("ПРОМЕНИ_МЕ_дълъг_случаен_низ_поне_32_знака"), null);
  assert.equal(await hitKey(undefined), null);
  assert.equal(constantTimeEqual(a!, b!), true);
  assert.equal(constantTimeEqual(a!, c!), false);
  assert.equal(constantTimeEqual(a!, ""), false);
});

test("седмицата започва в понеделник", () => {
  assert.equal(ymd(weekStart(new Date("2026-10-23T00:00:00Z"))), "2026-10-19"); // петък → пон
  assert.equal(ymd(weekStart(new Date("2026-10-19T00:00:00Z"))), "2026-10-19"); // пон
  assert.equal(ymd(weekStart(new Date("2026-10-25T00:00:00Z"))), "2026-10-19"); // нед
});

test("медиана, дял само при n ≥ 20, проценти", () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 100]), 2.5);
  assert.equal(safeRate(3, 19), null);
  assert.equal(safeRate(5, 20), 0.25);
  assert.equal(formatPct(null), "малко данни");
  assert.equal(formatPct(0.25), "25,0 %");
});

test("North Star: тази седмица срещу медианата на предишните пълни седмици", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const rows = [
    { day: d("2026-09-21"), count: 10 },
    { day: d("2026-09-28"), count: 20 },
    { day: d("2026-10-05"), count: 30 },
    { day: d("2026-10-12"), count: 40 },
    { day: d("2026-10-20"), count: 7 },
  ];
  // Броенето почва в пон 21.09 → 4 пълни седмици преди текущата.
  const ns = northStar(rows, d("2026-10-23"), d("2026-09-21"));
  assert.equal(ns.week, "2026-10-19");
  assert.equal(ns.current, 7);
  assert.equal(ns.weeksOfData, 4);
  assert.equal(ns.baseline, 25);
  // Почнало в сряда 23.09 → тази седмица е непълна и не влиза; остават 3 → малко данни.
  const ns2 = northStar(rows, d("2026-10-23"), d("2026-09-23"));
  assert.equal(ns2.weeksOfData, 3);
  assert.equal(ns2.baseline, null);
  // Без никакви данни.
  assert.equal(northStar([], d("2026-10-23"), null).baseline, null);
});
