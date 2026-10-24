// memory-core.mjs — ЕДНА реализация на операциите върху файл с памет и таблото.
//
// Защо съществува (2026-09-23): куката memory-capture държеше тези функции вътре в себе си. Когато
// ученето трябваше да се публикува и в отделен клон (tools/lib/memory-branch.mjs), а загубените по
// клоновете поуки — да се съберат (tools/agents/harvest-memory.mjs), трите места щяха да ПРЕПИШАТ
// вмъкването, дедупа и брояча. Преписан брояч дрейфва — точно урокът с двата списъка за тайни и двете
// дефиниции за „просрочена поука". Затова тук: чисти функции върху ТЕКСТ, без файлова система.
//
// Формат на поука (един ред): `- **YYYY-MM-DD:** <текст> _(<обхват>; <увереност>; <източник>…)_`

export const VERIFIED_HEADING = "Проверени поуки";
export const QUARANTINE_HEADING = "Карантина";

// Нормализация за дедуп — същата, която куката ползва от самото начало (не я променяй сама:
// промяна тук мени кои поуки се смятат за „същите" в целия флот).
export const norm = (s) => String(s).toLowerCase().replace(/[`'"„“”]/g, "").replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();

// ВНИМАНИЕ: анкерът трябва да СЪВПАДА с insertUnder (`^##` на ред). Дълго време ensureSections
// тестваше БЕЗ `^` (substring) → ако „## Проверени поуки" се появи НЕ в началото на ред (напр.
// в проза), ensureSections решаваше „секцията съществува" и не я добавяше, но insertUnder (с `^##`)
// не я намираше и добавяше булета осиротял в КРАЯ на файла. Двата предиката трябва да съдят еднакво.
export function ensureSections(txt) {
  if (!/^##\s*Проверени поуки/m.test(txt)) txt += `\n## Проверени поуки (verified)\n`;
  if (!/^##\s*Карантина/m.test(txt)) txt += `\n## Карантина (непроверени — НЕ са факт)\n`;
  return txt;
}

/** Вмъква РЕДОВЕТЕ (в дадения ред) веднага след заглавието — най-новото стои най-горе. */
export function insertUnder(txt, heading, lineOrLines) {
  const add = Array.isArray(lineOrLines) ? lineOrLines : [lineOrLines];
  if (!add.length) return txt;
  const lines = txt.split("\n");
  const idx = lines.findIndex((l) => new RegExp(`^##\\s*${heading}`).test(l));
  if (idx === -1) return txt + `\n${add.join("\n")}\n`;
  lines.splice(idx + 1, 0, ...add);
  return lines.join("\n");
}

/** Булетите на поуки (`- **…`) в раздел: "verified" | "quarantine". */
export function sectionLessons(txt, which) {
  const want = which === "verified" ? /verified|Проверени поуки/i : /Карантина/i;
  let inSec = false;
  const out = [];
  for (const ln of String(txt || "").split("\n")) {
    if (/^##\s/.test(ln)) { inSec = want.test(ln); continue; }
    if (inSec && /^\s*-\s+\*\*/.test(ln)) out.push(ln);
  }
  return out;
}

export const countVerifiedText = (txt) => sectionLessons(txt, "verified").length;

/** Текстът на поуката без датата и мета-опашката `_(…)_`. */
export function lessonText(line) {
  let s = String(line).replace(/^\s*-\s+\*\*[^*]*\*\*\s*/, "").trimEnd();
  // Мета-опашката е ПОСЛЕДНОТО `_(…)_` — текстът може сам да съдържа `_(` (код), затова не режем от първото.
  const i = s.lastIndexOf("_(");
  if (i !== -1 && s.endsWith(")_")) s = s.slice(0, i);
  return s.trim();
}

/** Ключ за „почти същата" поука: текстът без дата/мета, първите 80 нормализирани знака. */
export const bodyKey = (line) => norm(lessonText(line)).slice(0, 80);

/** Индекс на всичко, което вече е в текста (точно + по тяло) — за дедуп. */
export function lessonIndex(...texts) {
  const exact = new Set(), bodies = new Set();
  for (const t of texts) for (const w of ["verified", "quarantine"]) for (const l of sectionLessons(t, w)) {
    exact.add(norm(l));
    const b = bodyKey(l);
    if (b) bodies.add(b);
  }
  return { exact, bodies, has: (l) => exact.has(norm(l)) || bodies.has(bodyKey(l)) };
}

/**
 * Добавя поуки в текста на паметта, без дубли (точни или по тяло) спрямо вече наличното И помежду им.
 * @returns {{txt:string, added:{verified:string[], quarantine:string[]}}}
 */
export function addLessons(txt, { verified = [], quarantine = [] } = {}) {
  let out = ensureSections(String(txt || ""));
  const idx = lessonIndex(out);
  const added = { verified: [], quarantine: [] };
  for (const [which, list, heading] of [["verified", verified, VERIFIED_HEADING], ["quarantine", quarantine, QUARANTINE_HEADING]]) {
    for (const l of list) {
      if (!/^\s*-\s+\*\*/.test(l) || idx.has(l)) continue;
      idx.exact.add(norm(l)); idx.bodies.add(bodyKey(l));
      added[which].push(l);
    }
    out = insertUnder(out, heading, added[which]);
  }
  return { txt: out, added };
}

// ─── Таблото: версии и еволюция ────────────────────────────────────────────────────────────
export function cmpVer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}
export function latestVersion(a) {
  let best = "0.0.0";
  for (const e of a.evolution || []) if (cmpVer(e.version, best) > 0) best = e.version;
  return best;
}
// Схема „учене ролва в major": всеки 10 проверени поуки = +1 major; без таван.
export function bumpVersion(v) {
  const p = String(v).split(".").map((n) => parseInt(n, 10) || 0);
  let maj = p[0] || 0;
  let min = (p[1] || 0) + 1;
  if (min > 9) { maj += 1; min = 0; }
  return `${maj}.${min}.0`;
}
// По ЕДНА стъпка на ПРОВЕРЕНА поука (10 поуки = +1 major).
export function bumpVersionBy(v, n) {
  let out = v;
  for (let i = 0; i < Math.max(1, n); i++) out = bumpVersion(out);
  return out;
}

/** Activity + evolution текстове за група нови поуки (същата форма, която таблото винаги е имало). */
export function summarize(verifiedTexts, quarantineTexts, date) {
  const trim = (s) => (s.length > 90 ? s.slice(0, 87) + "…" : s);
  const v = verifiedTexts, q = quarantineTexts;
  if (!v.length && !q.length) return null;
  const summary = v.length
    ? `Научи: „${trim(v[0])}"` + (v.length > 1 ? ` (+${v.length - 1} още)` : "") + (q.length ? ` · ${q.length} в карантина` : "")
    : `Хипотеза → карантина: „${trim(q[0])}"` + (q.length > 1 ? ` (+${q.length - 1})` : "");
  return {
    activity: { date, type: v.length ? "learning" : "quarantine", summary },
    evoDetail: v.length ? `Научи: ${trim(v[0])}${v.length > 1 ? ` (+${v.length - 1} още)` : ""}` : null,
    verifiedCount: v.length,
  };
}

/**
 * Прилага учене към обекта на таблото (agents.json или FALLBACK). `lessons` е РЕАЛНИЯТ брой проверени
 * поуки (подава се отвън — ядрото не чете файлове). Връща true, ако нещо се е променило.
 */
export function applyUpdate(obj, agentId, activityEntry, evoDetail, verifiedCount = 1, lessons = null) {
  const a = (obj.agents || []).find((x) => x.id === agentId);
  if (!a) return false;
  let changed = false;
  a.activity = a.activity || [];
  if (activityEntry && !a.activity.some((x) => x.summary === activityEntry.summary)) {
    a.activity.unshift(activityEntry);
    changed = true;
  }
  if (lessons != null && a.knowledge && a.knowledge.lessons !== lessons) {
    a.knowledge.lessons = lessons;
    changed = true;
  }
  if (evoDetail) {
    a.evolution = a.evolution || [];
    if (!a.evolution.some((e) => e.detail === evoDetail)) {
      const next = bumpVersionBy(latestVersion(a), verifiedCount);
      a.evolution.push({ version: next, date: activityEntry?.date, event: `v${next.split(".").slice(0, 2).join(".")} — учене`, detail: evoDetail });
      changed = true;
    }
  }
  if (obj.meta && activityEntry) obj.meta.updated = activityEntry.date;
  return changed;
}
