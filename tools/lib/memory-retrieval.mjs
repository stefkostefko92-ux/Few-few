// memory-retrieval.mjs — кои поуки влизат в контекста на агента при старт.
//
// Защо е пренаписано (измерено 2026-09-23):
//  1. Задачата НЕ стига до куката. SubagentStart подава само agent_type/agent_id (проба на живо) —
//     затова подреждането по релевантност, описано и тествано, в продукция НИКОГА не е работило.
//     Задачата се взима от транскрипта на главната сесия: отвореното извикване на инструмента за
//     агенти със същия тип (проба: намира се надеждно в момента на старта).
//  2. Изборът ставаше само сред ПЪРВИТЕ 40 реда на файла → 27% от проверените поуки изобщо можеха да
//     бъдат избрани. Сега се подреждат всички.
//  3. „Най-новите" се гадаеха по позиция във файла — а куката вмъква отгоре, курацията пренарежда
//     (при Правния най-новата поука беше на позиция 241 от 254). Сега датата се чете от самия ред.
//  4. Чакащите поуки от agents/memory се слагаха най-отпред и изместваха собствените (регресия от
//     същия ден). Сега всички минават през едно и също подреждане.
// Плюс: остарелите по класа си на свежест се понижават; до 3 поуки от паметта на ДРУГИ агенти влизат,
// само ако са сред най-релевантните в целия флот — знанието циркулира по смисъл, без да надува
// статичния префикс.
//
// Чисти функции (без stdin/exit) — тестват се в tools/hooks/preload.test.mjs и tools/lib/memory-retrieval.test.mjs.

import { readFileSync, openSync, readSync, fstatSync, closeSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { classify } from "../agents/memory-freshness.mjs";
import { sectionLessons } from "./memory-core.mjs";

// ─── думи ─────────────────────────────────────────────────────────────────────────────────────
// Кратки служебни думи са отрязани по дължина (>2); тук са по-дългите, които не носят смисъл.
const STOP = new Set(("като това които която който което при или към след само няма може трябва тези този тази " +
  "всички всеки дали защото когато ако също още без над под между чрез пред през вече така там тук нещо " +
  "the and for with that this from are not you your have has was were will can should would into when").split(" "));
// Основа на словоформата: българският е флективен („фискален/фискалния/фискалните"), затова думите
// над 6 знака се сравняват по първите 6. Акроними и числа остават цели (SQL, XSS, 1.95583).
const stem = (w) => (w.length > 6 && /\p{L}/u.test(w) ? w.slice(0, 6) : w);
export function terms(text) {
  const out = new Set();
  for (const w of String(text).toLowerCase().replace(/[^\p{L}\p{N}.\s]/gu, " ").replace(/(?<!\d)\.|\.(?!\d)/g, " ").split(/\s+/)) {
    if (w.length > 2 && !STOP.has(w)) out.add(stem(w));
  }
  return out;
}

export function estTok(t) { let c = 0, o = 0; for (const ch of String(t)) { if (/[Ѐ-ӿ]/.test(ch)) c++; else o++; } return Math.round(c / 2.2 + o / 4); }
export const lessonDate = (line) => (String(line).match(/\*\*(\d{4}-\d{2}-\d{2})/) || [])[1] || "";

/** Изтекла ли е поуката по класа си на свежест (наш код 90 дни, платформа 180…). */
export function isExpired(line, today) {
  const d = lessonDate(line); if (!d || !today) return false;
  const c = classify(line); if (!c.days) return false;
  const end = new Date(d + "T00:00:00Z"); end.setUTCDate(end.getUTCDate() + c.days);
  return end.toISOString().slice(0, 10) < today;
}

/**
 * Подрежда поуки за задача. BM25-подобно: всяка обща основа носи тегло по рядкостта си в корпуса
 * (`df` — по подразбиране самият списък), нормализирано по дължината на поуката. Без задача —
 * най-новите по ДАТА. Изтеклите се понижават наполовина. Връща [{line, score}] без дубли.
 */
export function rank(lessons, task, { today = "", df = null, n = null } = {}) {
  const uniq = [...new Set(lessons)];
  const docs = uniq.map((line, i) => ({ line, i, t: terms(line), date: lessonDate(line) }));
  const q = terms(task || "");
  let N = n, DF = df;
  if (!DF) { DF = new Map(); N = docs.length; for (const d of docs) for (const w of d.t) DF.set(w, (DF.get(w) || 0) + 1); }
  const avg = docs.reduce((s, d) => s + d.t.size, 0) / Math.max(1, docs.length);
  const k1 = 1.2, b = 0.75;
  for (const d of docs) {
    let s = 0;
    if (q.size) for (const w of q) if (d.t.has(w)) {
      const idf = Math.log(1 + (N - (DF.get(w) || 0) + 0.5) / ((DF.get(w) || 0) + 0.5));
      s += idf * (k1 + 1) / (1 + k1 * (1 - b + b * d.t.size / (avg || 1)));
    }
    if (isExpired(d.line, today)) s *= 0.5;
    d.score = s;
  }
  // Резултат → дата (нова първа) → позиция във файла (само като последен, стабилен разделител).
  docs.sort((x, y) => y.score - x.score || y.date.localeCompare(x.date) || x.i - y.i);
  return docs.map((d) => ({ line: d.line, score: d.score }));
}

/**
 * Избор в бюджет. С задача: първо съвпадащите по релевантност; несъвпадащите (общ фон) — най-новите,
 * но само в `fillerBudget`, за да не се плаща пълният бюджет за шум. Без задача: най-новите по дата.
 */
export function select(lessons, task, { budget = 3200, fillerBudget = 800, maxCount = 40, today = "" } = {}) {
  const ranked = rank(lessons, task, { today });
  const hasTask = terms(task || "").size > 0;
  const out = []; let used = 0, filler = 0;
  for (const { line, score } of ranked) {
    if (out.length >= maxCount) break;
    const t = estTok(line);
    if (out.length && used + t > budget) break;
    if (hasTask && score === 0) { if (filler + t > fillerBudget) continue; filler += t; }
    out.push(line); used += t;
  }
  return out;
}

// ─── задачата от транскрипта на главната сесия ────────────────────────────────────────────────
/**
 * Текстът на задачата за агент `agentType`: отворените (без резултат) извиквания на инструмента за
 * агенти в опашката на главния транскрипт. При паралелна вълна от същия тип — обединението им
 * (по-добре общо подреждане, отколкото чуждо). Никога не хвърля; липса → "".
 */
export function taskFromTranscript(transcriptPath, agentType, { tailBytes = 4 << 20, maxChars = 6000 } = {}) {
  if (!transcriptPath || !agentType) return "";
  try {
    const fd = openSync(transcriptPath, "r");
    const size = fstatSync(fd).size, n = Math.min(size, tailBytes);
    const buf = Buffer.alloc(n); readSync(fd, buf, 0, n, size - n); closeSync(fd);
    const lines = buf.toString("utf8").split("\n"); if (n < size) lines.shift(); // първият ред може да е отрязан
    const uses = new Map(), done = new Set();
    for (const l of lines) {
      let r; try { r = JSON.parse(l); } catch { continue; }
      const c = r?.message?.content; if (!Array.isArray(c)) continue;
      for (const b of c) {
        if (b?.type === "tool_use" && (b.name === "Agent" || b.name === "Task")) uses.set(b.id, b.input || {});
        else if (b?.type === "tool_result") done.add(b.tool_use_id);
      }
    }
    const open = [...uses].filter(([id, inp]) => !done.has(id) && inp.subagent_type === agentType).map(([, inp]) => `${inp.description || ""} ${inp.prompt || ""}`);
    return open.join("\n").slice(-maxChars).trim();
  } catch { return ""; }
}

// ─── поуки от други агенти ────────────────────────────────────────────────────────────────────
/**
 * До `k` проверени поуки от ДРУГИ агенти, но само ако са сред `top` най-релевантните в целия флот
 * (относителен праг — дълга задача съвпада с много неща; абсолютен праг би пуснал шум).
 * Връща [{agent, line}].
 */
export function crossAgentPicks(memDir, selfId, task, { k = 3, top = 12, budget = 400, today = "" } = {}) {
  if (!terms(task || "").size) return [];
  const corpus = [];
  let files = [];
  try { files = readdirSync(memDir).filter((f) => /^[\w-]+\.md$/.test(f) && !/^(_shared|SECURITY|PROCEDURE|PROTOCOL|README)\.md$/.test(f)); } catch { return []; }
  for (const f of files) {
    const agent = f.replace(/\.md$/, "");
    let txt = ""; try { txt = readFileSync(join(memDir, f), "utf8"); } catch { continue; }
    for (const line of sectionLessons(txt, "verified")) corpus.push({ agent, line });
  }
  if (!corpus.length) return [];
  const ranked = rank(corpus.map((c) => c.line), task, { today });
  const owner = new Map(corpus.map((c) => [c.line, c.agent]));
  const out = []; let used = 0;
  for (const { line, score } of ranked.slice(0, top)) {
    if (score <= 0) break;
    const agent = owner.get(line);
    if (agent === selfId) continue;
    const t = estTok(line); if (used + t > budget) continue;
    out.push({ agent, line }); used += t;
    if (out.length >= k) break;
  }
  return out;
}
