#!/usr/bin/env node
// shorts-pick.mjs — кандидати за Shorts/Reels от дълго видео: начало, край и първият ред (hook) по транскрипта.
// Само чете и предлага; рендерът е на AI Studio (presets.mjs vertical916), публикува човек.
//
// Идея от youtube-agent-skill (`yt-shorts`, MIT; оценка на Социалджията 23.11.2026, „да“ от собственика) — кодът е
// наш, нищо не е внесено. Собственик: Социалджията. Всеки къс момент от дълго видео е нов 3-секунден hook.
//
//   node tools/social/shorts-pick.mjs запис.srt [--min 15] [--max 60] [--top 3] [--json]
//
// Как се избира: прозорци, подравнени по репликите (начало на реплика → край на реплика), с дължина в
// [--min, --max]. Точките идват от първата реплика (hook): въпрос, число, силна дума, започва на нова мисъл;
// и от края: свършва с изречение. Започване по средата („и после…“) сваля. Избират се най-силните без застъпване.
// Евристика, не присъда: retention.mjs след публикуване казва дали hook-ът е задържал.

import { readFileSync } from "node:fs";
import { parseTranscript } from "./retention.mjs";
import { isMain } from "../lib/is-main.mjs";

const STRONG = /(?<![\p{L}])(?:защо|как|никога|винаги|грешка|тайна|спри|истината|никой|всички|ето|why|how|never|always|mistake|secret|stop|nobody|everyone|here's)(?![\p{L}])/iu;
const MID_START = /^(?:и|а|но|или|защото|после|така|and|but|or|so|because|then)(?![\p{L}])/iu;
const ENDS_SENTENCE = /[.!?…]["“”»]?\s*$/u;

/** Точки за първия ред на кандидата. Чиста функция. */
export function hookScore(text, { prevEndsSentence = true } = {}) {
  const t = String(text || "").trim();
  const reasons = [];
  let score = 0;
  if (/\?/.test(t)) { score += 3; reasons.push("въпрос"); }
  if (/\d/.test(t)) { score += 2; reasons.push("число"); }
  if (STRONG.test(t)) { score += 2; reasons.push("силна дума"); }
  if (MID_START.test(t) || !prevEndsSentence) { score -= 3; reasons.push("започва по средата"); }
  else { score += 1; reasons.push("нова мисъл"); }
  if (t.length > 0 && t.length <= 80) { score += 1; reasons.push("кратък"); }
  return { score, reasons };
}

/** Кандидати без застъпване, най-силните първи. Чиста функция. */
export function pickShorts(cues, { min = 15, max = 60, top = 3 } = {}) {
  const list = (cues || []).filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start);
  const all = [];
  list.forEach((first, i) => {
    const hook = hookScore(first.text, { prevEndsSentence: i === 0 || ENDS_SENTENCE.test(list[i - 1].text) });
    // Най-дългият прозорец ≤ max, който свършва с изречение; иначе най-дългият ≤ max.
    let best = null;
    for (let j = i; j < list.length; j++) {
      const dur = list[j].end - first.start;
      if (dur > max) break;
      if (dur < min) continue;
      const clean = ENDS_SENTENCE.test(list[j].text);
      if (!best || clean || !best.clean) best = { j, dur, clean };
    }
    if (!best) return;
    const score = hook.score + (best.clean ? 2 : 0);
    const reasons = [...hook.reasons, ...(best.clean ? ["свършва с изречение"] : ["свършва по средата"])];
    all.push({ start: first.start, end: list[best.j].end, duration: Math.round(best.dur * 100) / 100, hook: first.text.trim(), score, reasons });
  });
  all.sort((a, b) => b.score - a.score || a.start - b.start);
  const picked = [];
  for (const c of all) {
    if (picked.length >= top) break;
    if (picked.every((p) => c.end <= p.start || p.end <= c.start)) picked.push(c);
  }
  return picked;
}

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function main(argv) {
  const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const file = argv.find((a, i) => !a.startsWith("--") && !(i > 0 && /^--(?:min|max|top)$/.test(argv[i - 1])));
  if (!file) { process.stderr.write("употреба: node tools/social/shorts-pick.mjs <транскрипт.srt|.vtt|.json> [--min 15] [--max 60] [--top 3] [--json]\n"); process.exit(2); }
  const num = (n, d) => { const v = opt(n); const x = v === undefined ? d : Number(v); if (!Number.isFinite(x) || x <= 0) { process.stderr.write(`--${n} трябва да е положително число\n`); process.exit(2); } return x; };
  const min = num("min", 15), max = num("max", 60), top = num("top", 3);
  const candidates = pickShorts(parseTranscript(readFileSync(file, "utf8")), { min, max, top });
  if (argv.includes("--json")) { process.stdout.write(JSON.stringify({ candidates }, null, 2) + "\n"); return; }
  if (!candidates.length) { process.stdout.write(`Няма прозорец между ${min} и ${max} s.\n`); return; }
  for (const c of candidates) process.stdout.write(`${mmss(c.start)}–${mmss(c.end)} (${c.duration} s) · точки ${c.score} · ${c.reasons.join(", ")}\n  hook: „${c.hook}“\n`);
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
