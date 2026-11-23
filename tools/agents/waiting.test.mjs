// waiting.test.mjs — панелът „Чака теб“ (искане на собственика, 23.11.2026): какво чака човека —
// PR-и за сливане, потоци, спрели при човек, решения, изтичащи твърдения, остарял жив гейт, таван на разхода.
import { test } from "node:test";
import assert from "node:assert/strict";
import { prItems, flowItems, claimItems, liveGateItem, budgetItems, collect, renderJs } from "./waiting.mjs";

const NOW = new Date("2026-11-23T12:00:00Z");

test("prItems: готовите PR-и са преди черновите; dependabot отделно; датата на снимката се пази", () => {
  const items = prItems([
    { number: 1, title: "чернова", draft: true, head: { ref: "claude/x" }, updated_at: "2026-11-20T10:00:00Z" },
    { number: 2, title: "готов", draft: false, head: { ref: "fix/y" }, updated_at: "2026-11-22T10:00:00Z" },
    { number: 3, title: "bump", draft: false, head: { ref: "dependabot/npm/z" }, updated_at: "2026-11-01T10:00:00Z" },
  ]);
  assert.deepEqual(items.map((i) => i.ref), ["#2", "#3", "#1"]);
  assert.equal(items[0].level, "действие");
  assert.match(items[1].title, /зависимост/i);
  assert.equal(items[2].level, "инфо");
});

test("flowItems: последното предаване е към човек и потокът не е затворен; само последните 14 дни", () => {
  const L = (o) => JSON.stringify(o);
  const lines = [
    L({ t: "start", ts: "2026-11-22T10:00:00Z", id: "a", flow: "плащане", lead: "prodavacha" }),
    L({ t: "handoff", ts: "2026-11-22T11:00:00Z", id: "a", from: "prodavacha", to: "човек", status: "блокер", note: "реални пари" }),
    L({ t: "handoff", ts: "2026-11-22T11:00:00Z", id: "b", from: "seo", to: "човек", status: "наред" }),
    L({ t: "close", ts: "2026-11-22T12:00:00Z", id: "b", status: "завършен" }),
    L({ t: "handoff", ts: "2026-10-01T11:00:00Z", id: "c", from: "seo", to: "човек", status: "има бележки" }),
    L({ t: "handoff", ts: "2026-11-21T11:00:00Z", id: "d", from: "ai-djiyata", to: "човек", status: "има бележки", note: "решение: TP на звука −1 или −1,5 dBTP" }),
    L({ t: "handoff", ts: "2026-11-21T12:00:00Z", id: "e", from: "seo", to: "kodadjiyata", status: "наред" }),
    "не е json",
  ];
  const items = flowItems(lines, { now: NOW });
  assert.deepEqual(items.map((i) => i.ref).sort(), ["a", "d"]);
  assert.equal(items.find((i) => i.ref === "a").level, "спешно", "блокер");
  assert.equal(items.find((i) => i.ref === "d").kind, "решение");
});

test("claimItems: изтеклите и изтичащите до 7 дни", () => {
  const reg = { ttlDays: 60, claims: [
    { id: "old", checkedAt: "2026-09-20" }, // 64 дни → изтекло
    { id: "soon", checkedAt: "2026-09-28" }, // 56 дни → 4 дни остават
    { id: "fresh", checkedAt: "2026-11-23" },
    { id: "own", checkedAt: "2026-11-10", ttlDays: 15 }, // 13 дни → 2 остават
  ] };
  const items = claimItems(reg, { today: "2026-11-23" });
  assert.deepEqual(items.map((i) => i.ref), ["old", "own", "soon"]);
  assert.equal(items[0].level, "спешно");
});

test("liveGateItem: сменени входове → едно действие; иначе нищо", () => {
  assert.equal(liveGateItem([]), null);
  const i = liveGateItem([".claude/hooks/guard-exfil.mjs", ".claude/settings.json"]);
  assert.equal(i.kind, "жив гейт");
  assert.match(i.detail, /2 входа/);
});

test("budgetItems: над прага и над тавана, подредени по тежест", () => {
  const cfg = { warnAt: 0.8, default: 100, agents: {}, generic: 50, fleet: 1000, approved: {} };
  const spend = { byAgent: { seo: 85, kodadjiyata: 120, generic: 10 }, fleet: 215 };
  const items = budgetItems(spend, cfg, "2026-11");
  assert.deepEqual(items.map((i) => [i.ref, i.level]), [["kodadjiyata", "спешно"], ["seo", "внимание"]]);
});

test("collect + renderJs: броячи по ниво и валиден JS за таблото", () => {
  const out = collect({ prs: [{ number: 9, title: "x", draft: false, head: { ref: "a" } }], flowLines: [], reg: { ttlDays: 60, claims: [] },
    changed: [], spend: { byAgent: {}, fleet: 0 }, cfg: null, now: NOW, prsAt: "2026-11-23" });
  assert.equal(out.counts.total, 1);
  assert.equal(out.prsAt, "2026-11-23");
  const js = renderJs(out);
  assert.match(js, /^window\.WAITING = /);
  const w = {}; new Function("window", js)(w);
  assert.equal(w.WAITING.items[0].ref, "#9");
});

test("budgetItems ползва правилото на куката — одобрението за месеца сваля „спешно“", () => {
  const cfg = { warnAt: 0.8, default: 100, agents: { kodadjiyata: 400 }, generic: 50, fleet: 1500, approved: { "2026-11": { kodadjiyata: 200, fleet: 500 } } };
  const items = budgetItems({ byAgent: { kodadjiyata: 450 }, fleet: 1600 }, cfg, "2026-11");
  assert.ok(!items.some((i) => i.level === "спешно"), JSON.stringify(items));
  assert.ok(items.some((i) => i.ref === "флот" && i.level === "внимание"));
});

test("renderJs: заглавие с </script> не затваря скрипта, а стойността се пази", () => {
  const evil = "fix </script><img src=x onerror=alert(1)> &  ";
  const js = renderJs({ items: [{ title: evil }] });
  assert.ok(!/<\/script/i.test(js) && !js.includes("<img"));
  const w = {}; new Function("window", js)(w);
  assert.equal(w.WAITING.items[0].title, evil);
});

test("prItems: черновите над 14 дни са един общ ред, не 40 отделни", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  const prs = [
    { number: 1, title: "нова чернова", draft: true, head: { ref: "a" }, updated_at: "2026-11-22T10:00:00Z" },
    ...Array.from({ length: 5 }, (_, i) => ({ number: 100 + i, title: "стара", draft: true, head: { ref: "b" }, updated_at: "2026-10-01T10:00:00Z" })),
    { number: 2, title: "готов", draft: false, head: { ref: "c" }, updated_at: "2026-10-01T10:00:00Z" },
  ];
  const items = prItems(prs, { now });
  assert.deepEqual(items.map((i) => i.ref), ["#2", "#1", "стари чернови"]);
  assert.match(items[2].title, /5 чернови/);
});
