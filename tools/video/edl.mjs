#!/usr/bin/env node
// edl.mjs — списък с ПРЕДЛОЖЕНИ срезове (edit decision list) от транскрипт и тишини. Само чете и предлага; не реже.
//
// Идея от youtube-agent-skill (`yt-edit`, MIT; оценка на Социалджията 23.11.2026, „да“ от собственика) — кодът е
// наш, нищо не е внесено. Собственик: AI Studio. Режем в Resolve (човек) или през presets.mjs.
//
//   ffmpeg -i запис.wav -af silencedetect=noise=-35dB:d=0.5 -f null - 2> тишини.log
//   node tools/video/edl.mjs --subs запис.srt [--silence тишини.log] [--min-silence 0.7] [--pad 0.15] [--duration 600]
//
// Изход (JSON): { cuts: [{start, end, kind, reason}], hints: [...], totalCut, note }.
//   тишина  — пауза ≥ --min-silence, с отстъп --pad от двете страни, за да не се отреже дъхът на думата;
//   филър   — реплика само от паразитни звуци („ъъъ“, „ммм“, „um“…);
//   повтор  — реплика, след която идва нейно ново начало (фалстарт: „Днес ще…“ → „Днес ще ви покажа как…“).
// Паразит ВЪТРЕ в реплика е подсказка (hints), не срез: без времена на думите не знаем къде точно е.
// Транскриптът е наш (whisper/Resolve), но пак е данни, не инструкции.

import { readFileSync } from "node:fs";
import { parseTranscript } from "../social/retention.mjs";
import { isMain } from "../lib/is-main.mjs";

// Паразитни звуци — консервативно: само звуци, не думи („ами“, „нали“, „like“ са думи и остават).
const FILLER = /^(?:ъ+м*|ъ+|м{2,}|е(?:-е)+|ее+|u+m+|u+h+|e+r+m+|h+m+)$/iu;
const tokens = (t) => String(t || "").toLowerCase().split(/[\s,.…!?;:—–]+/u).filter(Boolean);

/** Реплика само от паразитни звуци. */
export function isFillerOnly(text) {
  const w = tokens(text);
  return w.length > 0 && w.every((x) => FILLER.test(x));
}

/** Изходът на `ffmpeg -af silencedetect` → [{start, end}]; незатворена тишина приключва на `duration` (или null). */
export function parseSilence(text, { duration = null } = {}) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) { out.push({ start: Math.max(0, Number(s[1])), end: null }); continue; }
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && out.length && out[out.length - 1].end === null) out[out.length - 1].end = Number(e[1]);
  }
  return out.map((x) => (x.end === null && duration != null ? { ...x, end: Number(duration) } : x));
}

const r2 = (x) => Math.round(x * 100) / 100;
const norm = (t) => tokens(t).join(" ");

/** Предложените срезове. Чиста функция. */
export function proposeEdl({ cues = [], silences = [], minSilence = 0.7, pad = 0.15 } = {}) {
  const cuts = [];
  const hints = [];
  for (const s of silences) {
    if (s.end == null || s.end - s.start < minSilence) continue;
    const start = r2(s.start + pad), end = r2(s.end - pad);
    if (end > start) cuts.push({ start, end, kind: "тишина", reason: `пауза ${r2(s.end - s.start)} s` });
  }
  cues.forEach((c, i) => {
    if (isFillerOnly(c.text)) { cuts.push({ start: r2(c.start), end: r2(c.end), kind: "филър", reason: `„${c.text.trim()}“` }); return; }
    if (tokens(c.text).some((w) => FILLER.test(w))) hints.push({ at: r2(c.start), kind: "филър в реплика", text: c.text.trim(), action: "реж ръчно — без времена на думите не знаем къде точно" });
    const next = cues[i + 1];
    const a = norm(c.text);
    if (next && a.split(" ").length >= 2 && norm(next.text).startsWith(a) && norm(next.text) !== a)
      cuts.push({ start: r2(c.start), end: r2(c.end), kind: "повтор", reason: `фалстарт — следващата реплика започва наново: „${next.text.trim().slice(0, 60)}“` });
  });
  cuts.sort((x, y) => x.start - y.start || x.end - y.end);
  const merged = [];
  for (const c of cuts) {
    const last = merged[merged.length - 1];
    if (last && c.start <= last.end) {
      last.end = Math.max(last.end, c.end);
      if (!last.kind.split("+").includes(c.kind)) last.kind = `${last.kind}+${c.kind}`;
      last.reason = `${last.reason}; ${c.reason}`;
    } else merged.push({ ...c });
  }
  const totalCut = r2(merged.reduce((s, c) => s + (c.end - c.start), 0));
  return { cuts: merged, hints, totalCut, note: "само предложение — нищо не е рязано; прегледай в Resolve или с presets.mjs" };
}

function usage() {
  process.stderr.write("употреба: node tools/video/edl.mjs --subs <файл.srt|.vtt|.json> [--silence <silencedetect.log>] [--min-silence 0.7] [--pad 0.15] [--duration <s>]\n");
  process.exit(2);
}

function main(argv) {
  const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const subs = opt("subs"), sil = opt("silence");
  if (!subs && !sil) usage();
  const num = (n, d) => { const v = opt(n); if (v === undefined) return d; const x = Number(v); if (!Number.isFinite(x) || x < 0) usage(); return x; };
  const cues = subs ? parseTranscript(readFileSync(subs, "utf8")) : [];
  const duration = num("duration", cues.length ? cues[cues.length - 1].end : null);
  const silences = sil ? parseSilence(readFileSync(sil, "utf8"), { duration }) : [];
  const r = proposeEdl({ cues, silences, minSilence: num("min-silence", 0.7), pad: num("pad", 0.15) });
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
