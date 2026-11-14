#!/usr/bin/env node
// retention.mjs — къде зрителите си тръгват. Чете CSV със задържането, който СИ свалил от YouTube Studio
// (видео → Анализ → Ангажираност → графиката „Задържане на аудиторията“ → изтегляне), по желание и
// транскрипт на същото видео (SRT/VTT/whisper JSON или изходът на tools/research/video-notes.mjs).
//   node tools/social/retention.mjs retention.csv [--duration 45] [--hook 3] [--transcript t.srt] [--json]
// Наши данни, нула мрежа, нула зависимости. Казва ЕДНО най-голямо изтичане и какво се казва там.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHORT_MAX_S = 60;

/** Една клетка → число: „12,5%“ → 12.5, „1,234“ (хиляди) не се среща в тези експорти. */
function num(cell) {
  const c = String(cell).trim().replace(/^"|"$/g, "").replace(/%$/, "").trim();
  if (/^-?\d+,\d+$/.test(c)) return Number(c.replace(",", "."));
  if (/^-?\d+(\.\d+)?$/.test(c)) return Number(c);
  return null;
}

/** Ред от CSV: разделител `,` или `;`, полета в кавички. */
function cells(line) {
  const sep = line.includes(";") && !line.includes(",\"") && line.split(";").length > line.split(",").length - 1 ? ";" : ",";
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === "\"") quoted = !quoted;
    else if (ch === sep && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** [[позиция, задържане%], …] — първите две числа на всеки ред; заглавието отпада само. */
export function parseRetentionCsv(text) {
  const rows = [];
  for (const line of String(text).replace(/^﻿/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const values = cells(line).map(num).filter((v) => v !== null);
    if (values.length >= 2) rows.push([values[0], values[1]]);
  }
  return rows;
}

/** Задържането в точка x (линейно между съседните точки). */
function retentionAt(rows, x) {
  if (x <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i += 1) {
    const [x0, y0] = rows[i - 1];
    const [x1, y1] = rows[i];
    if (x <= x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return rows.at(-1)[1];
}

export function analyze(input, { duration, hook } = {}) {
  if (input.length < 8) throw new Error("трябват поне 8 точки от графиката — това ли е експортът от Studio?");
  const notes = [];
  const percentAxis = Math.max(...input.map(([x]) => x)) <= 100.5 && input.some(([x]) => x > 1);
  let rows = [...input].sort((a, b) => a[0] - b[0]);
  let axis = "seconds";
  let length = rows.at(-1)[0];
  if (percentAxis && duration) {
    rows = rows.map(([x, y]) => [(x / 100) * duration, y]);
    length = duration;
  } else if (percentAxis) {
    axis = "percent";
    notes.push("оста е в % от видеото — дай --duration <секунди>, за да станат спадовете в секунди");
  }

  const hookWindow =
    hook ?? (axis === "percent" ? 10 : length <= SHORT_MAX_S ? 3 : 30);
  const start = rows[0][1];
  const hookLeak = start - retentionAt(rows, hookWindow);

  const steps = [];
  for (let i = 1; i < rows.length; i += 1) {
    const [x0, y0] = rows[i - 1];
    const [x1, y1] = rows[i];
    const lost = y0 - y1;
    if (lost > 0) steps.push({ at: Math.round(x0 * 10) / 10, to: Math.round(x1 * 10) / 10, lost: Math.round(lost * 10) / 10, rate: lost / ((x1 - x0) || 1) });
  }
  // Спадовете след hook-а — в него загубата се отчита отделно.
  const cliffs = steps
    .filter((s) => s.at >= hookWindow && s.lost >= 1)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5)
    .map(({ at, to, lost }) => ({ at, to, lost }));

  const after = rows.filter(([x]) => x >= hookWindow);
  const span = after.length > 1 ? after.at(-1)[0] - after[0][0] : 0;
  const unit = axis === "percent" ? 10 : 60;
  const slidePerMinute = span > 0 ? ((after[0][1] - after.at(-1)[1]) / span) * unit : 0;

  const hookLimit = length <= SHORT_MAX_S && axis === "seconds" ? 15 : 25;
  let verdict;
  if (hookLeak >= hookLimit) verdict = { kind: "hook", text: `hook-ът губи ${hookLeak.toFixed(1)} пункта за първите ${hookWindow} ${axis === "percent" ? "%" : "s"} — оправи първите секунди на сценария, не монтажа` };
  else if (cliffs[0] && cliffs[0].lost >= 5) verdict = { kind: "cliff", text: `рязък спад от ${cliffs[0].lost} пункта на ${cliffs[0].at} ${axis === "percent" ? "%" : "s"} — виж какво се казва/случва там` };
  else if (slidePerMinute >= 10) verdict = { kind: "slide", text: `равномерно изтичане ${slidePerMinute.toFixed(1)} пункта/${axis === "percent" ? "10%" : "мин"} — темпото: режи, не пренаписвай` };
  else verdict = { kind: "packaging", text: "задържането е здраво — проблемът е в опаковката (заглавие, корица, първи кадър), не във видеото" };

  return { axis, length, hookWindow, start, hookLeak: Math.round(hookLeak * 10) / 10, cliffs, slidePerMinute: Math.round(slidePerMinute * 10) / 10, verdict, notes };
}

const ts = (s) => {
  const p = String(s).trim().replace(",", ".").split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
};

/** SRT, VTT, whisper JSON или пликът на video-notes → [{start, end, text}]. */
export function parseTranscript(text) {
  const raw = String(text);
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const data = JSON.parse(trimmed);
    const segs = Array.isArray(data) ? data : data.segments ?? [];
    return segs.map((s) => ({ start: Number(s.start), end: Number(s.end), text: String(s.text ?? "").trim() }));
  }
  const cues = [];
  const envelopeLine = /^│ \[\s*([\d.]+)–\s*([\d.]+)\]\s?(.*)$/;
  let cur = null;
  for (const line of raw.split(/\r?\n/)) {
    const env = envelopeLine.exec(line);
    if (env) { cues.push({ start: Number(env[1]), end: Number(env[2]), text: env[3].trim() }); cur = null; continue; }
    const m = /^\s*(\d[\d:.,]*)\s*-->\s*(\d[\d:.,]*)/.exec(line);
    if (m) { cur = { start: ts(m[1]), end: ts(m[2]), text: [] }; cues.push(cur); continue; }
    if (cur && line.trim() && !/^\d+$/.test(line.trim())) cur.text.push(line.trim());
    if (!line.trim()) cur = null;
  }
  return cues.map((c) => ({ ...c, text: Array.isArray(c.text) ? c.text.join(" ") : c.text })).filter((c) => c.text);
}

/** Какво се казва в секунда t — на един ред, до 160 знака (наш транскрипт, но пак само данни). */
export function spokenAt(cues, t) {
  const hit = cues.find((c) => c.start <= t && t <= c.end) ?? cues.find((c) => c.start > t && c.start - t <= 2);
  if (!hit) return null;
  const line = hit.text.replace(/\s+/g, " ").trim();
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

export async function run(argv, { log = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const file = argv.find((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && argv[i - 1] !== "--json"));
  if (!file || !existsSync(file)) {
    log("retention: дай CSV със задържането от YouTube Studio: retention.mjs <файл.csv> [--duration s] [--transcript t.srt]");
    return 2;
  }
  let result;
  try {
    result = analyze(parseRetentionCsv(readFileSync(file, "utf8")), {
      duration: opt("duration") ? Number(opt("duration")) : undefined,
      hook: opt("hook") ? Number(opt("hook")) : undefined,
    });
  } catch (error) {
    log(`retention: ${error.message}`);
    return 1;
  }
  const transcriptPath = opt("transcript");
  const cues = transcriptPath && existsSync(transcriptPath) ? parseTranscript(readFileSync(transcriptPath, "utf8")) : [];
  if (result.axis === "seconds") for (const c of result.cliffs) c.said = spokenAt(cues, c.at);

  if (argv.includes("--json")) { log(JSON.stringify(result, null, 2)); return 0; }
  const u = result.axis === "percent" ? "%" : "s";
  log(`Изтичане в hook-а (първите ${result.hookWindow} ${u}): ${result.hookLeak} пункта (от ${result.start}%)`);
  log(`Плъзгане след hook-а: ${result.slidePerMinute} пункта/${result.axis === "percent" ? "10%" : "мин"}`);
  if (result.cliffs.length) {
    log("Резки спадове:");
    for (const c of result.cliffs) log(`  ${c.at}–${c.to} ${u}: −${c.lost} пункта${c.said ? ` · казано: „${c.said}“` : ""}`);
  }
  log(`Най-голямото: ${result.verdict.text}`);
  for (const n of result.notes) log(`Бележка: ${n}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2));
}
