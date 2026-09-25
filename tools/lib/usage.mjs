// usage.mjs — реалната употреба на токени от пусканията на агенти (не оценка от статичния текст).
//
// Защо (измерено 2026-09-23 върху 517 пускания): цялата токен-отчетност на флота беше ОЦЕНКА —
// token-budget и flow-cost броят дефиниция + префикс + памет, а това е под 8% от реалната цена.
// Над 90% идва от цикъла с инструменти (всеки ход препрочита и дописва натрупания контекст в кеша).
// Транскриптите на субагентите носят точната употреба на всеки ход, но нито един инструмент не я
// четеше. Тук е четецът. Записът е САМО числа: агент, модел, усилие, ходове, токени по вид,
// инструменти, обем на резултатите, връх на контекста, продължителност — нула текст от задачата.

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const USAGE_PATH = "tools/agents/evals/usage.jsonl";
export const PRICES_FILE = join(HERE, "..", "agents", "prices.json");

/** Ценоразпис (USD за 1M токена) с източник и дата на сверка. */
export function loadPrices(file = PRICES_FILE) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}
/** Цена за модел: най-дългото съвпадение по префикс на id-то (claude-opus-5 ≠ claude-opus-5-5). */
export function priceOf(model, prices = loadPrices()) {
  const m = String(model || "").replace(/^claude-/, "").replace(/-\d{8}$/, "");
  const rows = prices?.models || [];
  let best = null;
  for (const r of rows) if (m === r.id || m.startsWith(r.id + "-") || m.startsWith(r.id)) if (!best || r.id.length > best.id.length) best = r;
  return best;
}
/** Цена на едно пускане по цените на API: вход, кеш-четене (×0.1), кеш-запис 5 мин (×1.25), изход. */
export function costOf(rec, prices = loadPrices()) {
  const parts = costParts(rec, prices);
  return parts ? parts.input + parts.cacheRead + parts.cacheWrite + parts.output : null;
}
/** Цената по компонент (USD). Кеш-четенето е изрична цена, където моделът има такава. */
export function costParts(rec, prices = loadPrices()) {
  const p = priceOf(rec.model, prices); if (!p) return null;
  const c = prices.cache || { read: 0.1, write: 1.25 };
  const readPrice = p.cacheRead ?? p.in * c.read;
  return { input: rec.input * p.in / 1e6, cacheRead: rec.cacheRead * readPrice / 1e6, cacheWrite: rec.cacheWrite * c.write * p.in / 1e6, output: rec.output * p.out / 1e6 };
}

/** Типът на агента: .meta.json до транскрипта → маркерът на паметта → „общ". */
function agentTypeOf(path, lines) {
  const meta = path.replace(/\.jsonl$/, ".meta.json");
  if (existsSync(meta)) { try { const t = JSON.parse(readFileSync(meta, "utf8")).agentType; if (t) return t; } catch { /* ignore */ } }
  for (const r of lines.slice(0, 6)) {
    const m = JSON.stringify(r).match(/Проверена памет на „([^"“\\]+)/);
    if (m) return m[1];
  }
  return "общ";
}

/** Версия на записа. 2 = дедуп по message.id с най-големия output (2026-09-24); записи с по-ниска
 *  версия са надути ~2.7× и `usage-report --backfill` ги пресмята наново от транскрипта. */
export const USAGE_RECORD_V = 2;

/**
 * Сумира транскрипт на субагент в ЕДИН запис. Връща null при празен/нечетим транскрипт.
 * @param {string} path
 * @param {{agentType?:string, effort?:string}} hint — от payload-а на куката, ако го има
 */
export function summarizeTranscript(path, hint = {}) {
  let lines;
  try { lines = readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return null; }
  let turns = 0, input = 0, cacheRead = 0, cacheWrite = 0, output = 0, tools = 0, resultBytes = 0, peakCtx = 0, startCtx = 0, model = "", effort = hint.effort || "";
  let t0 = "", t1 = "";
  // Един API отговор се записва на НЯКОЛКО реда (thinking / text / tool_use) със СЪЩИЯ message.id.
  // Входните броячи са еднакви, а output_tokens РАСТЕ ред по ред (стрийминг снимка). Без дедуп всеки
  // ход се броеше 2–3 пъти (Разбивача); с дедуп по ПЪРВИЯ ред изходът излизаше 4.8× по-малък
  // (AI-джията, 2026-09-24). Затова: един запис на message.id, взет с най-големия output_tokens.
  const usages = new Map();
  let anon = 0;
  for (const r of lines) {
    if (r.timestamp) { if (!t0) t0 = r.timestamp; t1 = r.timestamp; }
    if (!effort && typeof r.effort === "string") effort = r.effort;
    const m = r.message; if (!m) continue;
    if (m.model && !/synthetic/.test(m.model)) model = m.model;
    if (Array.isArray(m.content)) for (const b of m.content) {
      if (b?.type === "tool_use") tools++;
      else if (b?.type === "tool_result") resultBytes += Buffer.byteLength(typeof b.content === "string" ? b.content : JSON.stringify(b.content || ""));
    }
    const u = m.usage; if (!u) continue;
    const key = m.id || `anon-${anon++}`;
    const prev = usages.get(key);
    if (!prev || (u.output_tokens || 0) >= (prev.output_tokens || 0)) usages.set(key, u);
  }
  for (const u of usages.values()) {
    turns++;
    input += u.input_tokens || 0; cacheRead += u.cache_read_input_tokens || 0; cacheWrite += u.cache_creation_input_tokens || 0; output += u.output_tokens || 0;
    const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    if (turns === 1) startCtx = ctx; // първият ход: системен промпт + дефиниция + доктрина + памет + задача
    peakCtx = Math.max(peakCtx, ctx);
  }
  if (!turns) return null;
  const id = createHash("sha1").update(basename(path)).digest("hex").slice(0, 10);
  const durationSec = t0 && t1 ? Math.round((Date.parse(t1) - Date.parse(t0)) / 1000) : null;
  return {
    v: USAGE_RECORD_V, id, ts: (t0 || new Date().toISOString()).slice(0, 16),
    agent: hint.agentType || agentTypeOf(path, lines), model: model.replace(/^claude-/, "").replace(/-\d{8}$/, ""), effort: effort || null,
    turns, input, cacheRead, cacheWrite, output, tools, resultBytes, startCtx, peakCtx, durationSec,
  };
}

// Дневникът е данни от диска (и от клона agents/memory) — не им вярвай на формата. Нечислови или
// отрицателни броячи правеха цената NaN, а агент „__proto__“ пишеше в прототипа на обекта.
const NUM_FIELDS = ["turns", "input", "cacheRead", "cacheWrite", "output", "tools", "resultBytes", "startCtx", "peakCtx"];
function cleanRecord(r) {
  if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id) return null;
  for (const k of NUM_FIELDS) if (k in r && !(Number.isFinite(r[k]) && r[k] >= 0)) return null;
  for (const k of ["agent", "model"]) if (k in r && typeof r[k] !== "string") return null;
  return r;
}

/** Чете записи от JSONL текст; дедуп по id — по-късният запис побеждава. */
export function parseLedger(...texts) {
  const byId = new Map();
  for (const t of texts) for (const l of String(t || "").split("\n")) {
    if (!l.trim()) continue;
    // Последният запис побеждава: агент, върнат от DoD куката, спира пак със СЪЩИЯ транскрипт и
    // по-късният запис е пълният (първият е частичен — занижава ходове и цена).
    // По-новата ВЕРСИЯ на записа печели независимо от реда на източниците (клон, работно дърво,
    // буфер — по-стар източник, прочетен по-късно, иначе надписваше пресметнатия наново запис).
    try {
      const r = cleanRecord(JSON.parse(l));
      if (!r) continue;
      const prev = byId.get(r.id);
      if (!prev || (r.v || 1) >= (prev.v || 1)) byId.set(r.id, r);
    } catch { /* ignore */ }
  }
  return [...byId.values()];
}

const q = (arr, p) => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))]; };

/** Обобщение: цена по компонент, по модел, по агент, ходове p50/p90, дългите пускания. */
export function aggregate(recs, prices = loadPrices()) {
  const out = { runs: recs.length, usd: 0, parts: { cacheRead: 0, cacheWrite: 0, output: 0, input: 0 }, byModel: Object.create(null), byAgent: Object.create(null), turns: { p50: q(recs.map((r) => r.turns), 0.5), p90: q(recs.map((r) => r.turns), 0.9) }, long: { runs: 0, usd: 0 }, priced: 0 };
  for (const r of recs) {
    const parts = costParts(r, prices); if (!parts) continue;
    const usd = parts.input + parts.cacheRead + parts.cacheWrite + parts.output;
    out.priced++; out.usd += usd;
    for (const k of Object.keys(parts)) out.parts[k] += parts[k];
    const bm = (out.byModel[r.model] ??= { runs: 0, usd: 0, turns: 0 }); bm.runs++; bm.usd += usd; bm.turns += r.turns;
    const ba = (out.byAgent[r.agent] ??= { runs: 0, usd: 0, turns: 0 }); ba.runs++; ba.usd += usd; ba.turns += r.turns;
    if (r.turns >= 60) { out.long.runs++; out.long.usd += usd; }
  }
  return out;
}
